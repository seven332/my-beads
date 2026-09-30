import { test, expect } from "@playwright/test";
import { openPreview, supportsWebGL } from "./preview-helpers.js";

interface OutputSample {
  background: number[];
  programs: {
    neutral: boolean;
    srgb: boolean;
    exposure: number | null;
    occlusion: number | null;
  }[];
}
declare global {
  interface Window {
    previewOutput?: OutputSample;
  }
}

/** Observe actual canvas draws and pixels; never import or replace the renderer. */
function observeOutput() {
  const programs = new Map<WebGLProgram, OutputSample["programs"][number]>();
  let drawn: WebGL2RenderingContext | undefined;
  function record(gl: WebGL2RenderingContext) {
    if (
      !(gl.canvas instanceof HTMLCanvasElement) ||
      !gl.canvas.matches(".preview-canvas") ||
      gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) !== null
    )
      return;
    drawn = gl;
    const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;
    const fragment = gl
      .getAttachedShaders(program)!
      .find((shader) => gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.FRAGMENT_SHADER)!;
    const source = gl.getShaderSource(fragment)!;
    const exposure = gl.getUniformLocation(program, "toneMappingExposure");
    const occlusion = gl.getUniformLocation(program, "aoMapIntensity");
    programs.set(program, {
      neutral: /return NeutralToneMapping\( color \)/.test(source),
      srgb: /linearToOutputTexel[^}]+sRGBTransferOETF/.test(source),
      exposure: exposure === null ? null : gl.getUniform(program, exposure),
      occlusion: occlusion === null ? null : gl.getUniform(program, occlusion),
    });
  }
  const gl = WebGL2RenderingContext.prototype;
  const draw = gl.drawElements;
  gl.drawElements = function (...args) {
    draw.apply(this, args);
    record(this);
  };
  const instances = gl.drawElementsInstanced;
  gl.drawElementsInstanced = function (...args) {
    instances.apply(this, args);
    record(this);
  };
  const arrays = gl.drawArrays;
  gl.drawArrays = function (...args) {
    arrays.apply(this, args);
    record(this);
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((time) => {
      callback(time);
      if (!drawn) return;
      const context = drawn;
      drawn = undefined;
      // Read in the drawing callback, before the non-preserved buffer is presented/cleared.
      const pixels = new Uint8Array(4);
      context.readPixels(0, 0, 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixels);
      window.previewOutput = {
        background: Array.from(pixels.slice(0, 3)),
        programs: [...programs.values()],
      };
    });
}

for (const fallback of [false, true])
  test(`preserves sRGB reference colors with ${fallback ? "direct-light fallback" : "neutral environment output"}`, async ({
    page,
  }) => {
    await page.addInitScript(observeOutput);
    if (fallback)
      await page.addInitScript(() => {
        const original = WebGL2RenderingContext.prototype.getExtension;
        Reflect.set(
          WebGL2RenderingContext.prototype,
          "getExtension",
          function (this: WebGL2RenderingContext, name: string) {
            if (
              (this.canvas as HTMLCanvasElement).matches(".preview-canvas") &&
              ["EXT_color_buffer_float", "EXT_color_buffer_half_float"].includes(name)
            )
              return null;
            return Reflect.apply(original, this, [name]);
          },
        );
      });
    await page.goto("./");
    await page
      .getByLabel("Open CSV")
      .setInputFiles({
        name: "Output.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("H7,H5,H4,H2,B15,D22,F13,A7"),
      });
    test.skip(!(await supportsWebGL(page)), "WebGL2 unavailable");
    const halfFloat = await page.evaluate(() => {
      const context = document.createElement("canvas").getContext("webgl2")!;
      const supported = Boolean(
        context.getExtension("EXT_color_buffer_float") ||
        context.getExtension("EXT_color_buffer_half_float"),
      );
      context.getExtension("WEBGL_lose_context")?.loseContext();
      return supported;
    });
    const neutral = halfFloat && !fallback;
    await openPreview(page, true);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      const background = colorScheme === "light" ? [232, 236, 228] : [28, 35, 31];
      await expect
        .poll(() => page.evaluate(() => window.previewOutput?.background))
        .toEqual(background);
      const output = (await page.evaluate(() => window.previewOutput))!;
      // Lit markings share the board program; all surfaces use indirect-light occlusion.
      expect(output.programs).toHaveLength(3);
      expect(output.programs.filter((program) => program.neutral)).toHaveLength(neutral ? 3 : 0);
      expect(output.programs.every((program) => program.srgb)).toBe(true);
      for (const program of output.programs) {
        expect(program.occlusion).toBe(1);
        if (program.neutral) expect(program.exposure).toBeCloseTo(1.1, 5);
        else expect(program.exposure).toBeNull();
      }
    }
  });

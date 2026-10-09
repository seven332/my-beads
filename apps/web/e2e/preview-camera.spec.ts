import { expect, test, type Page } from "@playwright/test";
import { selectChoice } from "./helpers.js";
import { supportsWebGL } from "./preview-helpers.js";

interface CameraSample {
  view: number[];
  projection: number[];
  draws: number;
}

async function observeCamera(page: Page) {
  await page.evaluate(() => {
    const sample = { view: [] as number[], projection: [] as number[], draws: 0 };
    Reflect.set(window, "previewCamera", sample);
    const uniforms = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation>>();
    const gl = WebGL2RenderingContext.prototype;
    const location = gl.getUniformLocation;
    gl.getUniformLocation = function (program, name) {
      const result = location.call(this, program, name);
      if (result && (name === "viewMatrix" || name === "projectionMatrix")) {
        if (!uniforms.has(program)) uniforms.set(program, new Map());
        uniforms.get(program)!.set(name, result);
      }
      return result;
    };
    for (const name of ["drawElements", "drawElementsInstanced"]) {
      const draw = Reflect.get(gl, name) as (
        this: WebGL2RenderingContext,
        ...args: number[]
      ) => void;
      Reflect.set(gl, name, function (this: WebGL2RenderingContext, ...args: number[]) {
        draw.apply(this, args);
        if (
          !(this.canvas instanceof HTMLCanvasElement) ||
          !this.canvas.matches(".preview-canvas") ||
          this.getParameter(this.DRAW_FRAMEBUFFER_BINDING) !== null
        )
          return;
        const program = this.getParameter(this.CURRENT_PROGRAM) as WebGLProgram;
        const view = uniforms.get(program)?.get("viewMatrix");
        const projection = uniforms.get(program)?.get("projectionMatrix");
        if (view && projection) {
          // Read the uniforms actually used by the draw, including cached values.
          sample.view = Array.from(this.getUniform(program, view) as Float32Array);
          sample.projection = Array.from(this.getUniform(program, projection) as Float32Array);
          sample.draws++;
        }
      });
    }
  });
}

async function readCamera(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
  });
  return page.evaluate(() => Reflect.get(window, "previewCamera") as CameraSample);
}

for (const { name, viewport, chinese } of [
  { name: "desktop", viewport: { width: 1440, height: 1000 }, chinese: false },
  { name: "tablet", viewport: { width: 740, height: 844 }, chinese: false },
  { name: "mobile English", viewport: { width: 350, height: 844 }, chinese: false },
  { name: "mobile Chinese", viewport: { width: 390, height: 844 }, chinese: true },
]) {
  test(`${name} mode switches retain the camera after orbit, zoom, pan and explicit reset`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("./");
    // An off-center motif distinguishes the pegboard fit from the occupied fused fit.
    const csv = Array.from({ length: 16 }, (_, y) =>
      Array.from({ length: 24 }, (_, x) =>
        x >= 3 && x <= 5 && y >= 2 && y <= 3 ? (x === 4 ? "H2" : "F13") : "",
      ).join(","),
    ).join("\n");
    await page
      .getByLabel("Open CSV")
      .setInputFiles({ name: "Camera.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    if (chinese)
      await selectChoice(page.getByRole("combobox", { name: "Language", exact: true }), "zh-CN");
    test.skip(!(await supportsWebGL(page)), "WebGL2 unavailable");
    await observeCamera(page);
    const heading = chinese ? "3D 预览" : "3D preview";
    await page.getByRole("button", { name: heading, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: heading, exact: true });
    await expect(dialog.locator(".preview-stage")).toHaveAttribute("data-status", "ready");
    const canvas = dialog.locator("canvas");
    const boardNote = dialog.getByText(chinese ? "未熨烫的摆豆效果。" : "Unfused beads.");
    const fusedNote = dialog.getByText(chinese ? "完全闭孔的熨烫成品。" : "Fully fused artwork.");
    const boardDescription = new RegExp(chinese ? "未熨烫的摆豆效果" : "Unfused beads");
    const fusedDescription = new RegExp(chinese ? "完全闭孔的熨烫成品" : "Fully fused artwork");
    await expect(boardNote).toBeVisible();
    await expect(fusedNote).toBeHidden();
    await expect(canvas).toHaveAccessibleDescription(boardDescription);
    await expect(canvas).not.toHaveAccessibleDescription(fusedDescription);
    const initial = await readCamera(page);
    expect(initial.view).toHaveLength(16);
    expect(initial.projection).toHaveLength(16);
    const canvasBounds = await canvas.boundingBox();
    const board = dialog.getByRole("button", {
      name: chinese ? "板上摆豆" : "On board",
      exact: true,
    });
    const fused = dialog.getByRole("button", { name: chinese ? "熨烫成品" : "Fused", exact: true });
    const reset = dialog.getByRole("button", {
      name: chinese ? "重置视角" : "Reset view",
      exact: true,
    });
    async function switchAndCheck(button: typeof board, before: CameraSample) {
      await button.click();
      const after = await readCamera(page);
      expect(after.draws).toBeGreaterThan(before.draws);
      expect(await canvas.boundingBox()).toEqual(canvasBounds);
      expect(after.view).toEqual(before.view);
      expect(after.projection).toEqual(before.projection);
      return after;
    }
    let current = await switchAndCheck(fused, initial);
    await expect(boardNote).toBeHidden();
    await expect(fusedNote).toBeVisible();
    await expect(canvas).toHaveAccessibleDescription(fusedDescription);
    await expect(canvas).not.toHaveAccessibleDescription(boardDescription);
    await dialog
      .getByRole("button", { name: chinese ? "向左旋转" : "Rotate left", exact: true })
      .click();
    const rotated = await readCamera(page);
    expect(rotated.view).not.toEqual(current.view);
    await dialog.getByRole("button", { name: chinese ? "放大" : "Zoom in", exact: true }).click();
    const zoomed = await readCamera(page);
    expect(zoomed.view).not.toEqual(rotated.view);
    const box = canvasBounds!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 20, { steps: 4 });
    await page.mouse.up({ button: "right" });
    current = await readCamera(page);
    expect(current.view).not.toEqual(zoomed.view);
    for (let i = 0; i < 3; i++) {
      current = await switchAndCheck(board, current);
      current = await switchAndCheck(fused, current);
    }
    await reset.click();
    const fittedFused = await readCamera(page);
    expect(fittedFused.view).not.toEqual(current.view);
    expect(fittedFused.view).not.toEqual(initial.view);
    await switchAndCheck(board, fittedFused);
    await reset.click();
    const fittedBoard = await readCamera(page);
    expect(fittedBoard.view).toEqual(initial.view);
    expect(fittedBoard.projection).toEqual(initial.projection);
    await expect(boardNote).toBeVisible();
    await expect(fusedNote).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}

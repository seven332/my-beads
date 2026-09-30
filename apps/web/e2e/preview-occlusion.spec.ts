import { expect, test } from "@playwright/test";
import { installPreviewProbe } from "../benchmarks/probe.js";
import { openPreview, supportsWebGL } from "./preview-helpers.js";

declare global {
  interface Window {
    previewOcclusion: {
      uploads: { width: number; height: number; minimum: number; maximum: number }[];
      deleted: number;
    };
  }
}

function observeOcclusion(fail: boolean) {
  window.previewOcclusion = { uploads: [], deleted: 0 };
  const textures = new WeakSet<WebGLTexture>();
  const gl = WebGL2RenderingContext.prototype;
  const upload = gl.texSubImage2D;
  Reflect.set(gl, "texSubImage2D", function (this: WebGL2RenderingContext, ...args: unknown[]) {
    Reflect.apply(upload, this, args);
    if (!(this.canvas instanceof HTMLCanvasElement) || !this.canvas.matches(".preview-canvas"))
      return;
    const pixels = args[8];
    if (args[6] !== this.RED || !(pixels instanceof Uint8Array)) return;
    textures.add(this.getParameter(this.TEXTURE_BINDING_2D) as WebGLTexture);
    let minimum = 255;
    let maximum = 0;
    for (const value of pixels) {
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    window.previewOcclusion.uploads.push({
      width: Number(args[4]),
      height: Number(args[5]),
      minimum,
      maximum,
    });
  });
  const remove = gl.deleteTexture;
  gl.deleteTexture = function (texture) {
    if (texture && textures.has(texture)) window.previewOcclusion.deleted++;
    remove.call(this, texture);
  };
  const mipmap = gl.generateMipmap;
  gl.generateMipmap = function (target) {
    mipmap.call(this, target);
    if (fail && textures.has(this.getParameter(this.TEXTURE_BINDING_2D) as WebGLTexture)) {
      fail = false;
      throw new Error("Injected AO mipmap failure");
    }
  };
}

for (const fail of [false, true])
  test(
    fail
      ? "releases contact maps when mipmap initialization fails and allows retry"
      : "uploads two shared contact maps once and releases them on close",
    async ({ page }) => {
      await page.addInitScript(installPreviewProbe);
      await page.addInitScript(observeOcclusion, fail);
      await page.goto("./");
      await page
        .getByLabel("Open CSV")
        .setInputFiles({
          name: "Contacts.csv",
          mimeType: "text/csv",
          buffer: Buffer.from("H2,,H7\n,F13,"),
        });
      test.skip(!(await supportsWebGL(page)), "WebGL2 unavailable");
      const read = () => page.evaluate(() => window.previewBenchmark.snapshot());
      const uploads = () => page.evaluate(() => window.previewOcclusion);
      let earlierUploads = 0;
      if (fail) {
        const failed = await openPreview(page, false);
        await expect(failed.getByRole("alert")).toBeVisible();
        await expect.poll(async () => (await read()).contexts[0].lost).toBe(true);
        const failedMaps = await uploads();
        expect(failedMaps.uploads).toContainEqual({
          width: 84,
          height: 72,
          minimum: 153,
          maximum: 255,
        });
        // Material sorting may upload the shared local map before the board map fails.
        expect(failedMaps.deleted).toBe(failedMaps.uploads.length);
        earlierUploads = failedMaps.uploads.length;
        await page.keyboard.press("Escape");
      }
      const dialog = await openPreview(page, true);
      const before = await uploads();
      const maps = before.uploads.slice(earlierUploads);
      expect(maps).toEqual(
        expect.arrayContaining([
          { width: 16, height: 32, minimum: 89, maximum: 255 },
          { width: 84, height: 72, minimum: 153, maximum: 255 },
        ]),
      );
      expect(maps).toHaveLength(2);
      await dialog.getByRole("button", { name: "Rotate left" }).click();
      await page.emulateMedia({ colorScheme: "dark" });
      await page.setViewportSize({ width: 1200, height: 900 });
      await page.evaluate(async () => {
        for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame);
      });
      expect(await uploads()).toEqual(before);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect.poll(async () => (await read()).contexts.at(-1)?.lost).toBe(true);
      expect((await uploads()).deleted).toBe(before.uploads.length);
      for (const context of (await read()).contexts)
        for (const resource of Object.values(context.resources)) {
          expect(resource.live).toBe(0);
          expect(resource.created).toBe(resource.deleted + resource.reclaimed);
        }
    },
  );

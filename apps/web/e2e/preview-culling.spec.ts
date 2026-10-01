import { expect, test } from "@playwright/test";
import { installPreviewProbe } from "../benchmarks/probe.js";
import { openPreview, supportsWebGL } from "./preview-helpers.js";

test.use({ deviceScaleFactor: 1, viewport: { width: 480, height: 480 } });

test("culls native offscreen instance batches, restores coverage and releases shared resources", async ({
  page,
}) => {
  await page.addInitScript(installPreviewProbe);
  await page.goto("./");
  // Three horizontal regions with modest native work, not a maximum-size throughput test.
  await page
    .getByLabel("Open CSV")
    .setInputFiles({
      name: "Regions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        Array.from({ length: 4 }, () => Array<string>(128).fill("H2").join(",")).join("\n"),
      ),
    });
  test.skip(!(await supportsWebGL(page)), "WebGL2 unavailable");
  await page.evaluate(() => {
    const submitted: { indices: number; instances: number }[] = [];
    Reflect.set(window, "regionSubmissions", submitted);
    const gl = WebGL2RenderingContext.prototype;
    const clear = gl.clear;
    gl.clear = function (...args) {
      if ((this.canvas as HTMLCanvasElement).matches(".preview-canvas")) submitted.length = 0;
      return clear.apply(this, args);
    };
    const draw = gl.drawElementsInstanced;
    gl.drawElementsInstanced = function (...args) {
      if ((this.canvas as HTMLCanvasElement).matches(".preview-canvas"))
        submitted.push({ indices: args[1], instances: args[4] });
      return draw.apply(this, args);
    };
  });
  const settle = () =>
    page.evaluate(async () => {
      for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
    });
  const counts = () =>
    page.evaluate(() => {
      const draws = Reflect.get(window, "regionSubmissions") as {
        indices: number;
        instances: number;
      }[];
      return {
        beads: draws
          .filter((draw) => draw.indices > 144)
          .reduce((n, draw) => n + draw.instances, 0),
        pegs: draws
          .filter((draw) => draw.indices <= 144)
          .reduce((n, draw) => n + draw.instances, 0),
      };
    });
  const read = () => page.evaluate(() => window.previewBenchmark.snapshot());
  const dialog = await openPreview(page, true);
  await settle();
  expect(await counts()).toEqual({ beads: 512, pegs: 1056 });
  for (let i = 0; i < 9; i++) {
    await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
    await settle();
  }
  const close = await counts();
  expect(close.beads).toBeGreaterThan(0);
  expect(close.beads).toBeLessThan(512);
  expect(close.pegs).toBeGreaterThan(0);
  expect(close.pegs).toBeLessThan(1056);
  const canvas = (await dialog.locator("canvas").boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(canvas.x + canvas.width * 0.75, canvas.y + canvas.height / 2, { steps: 3 });
  await page.mouse.up({ button: "right" });
  await settle();
  const panned = await counts();
  expect(panned.beads).toBeGreaterThan(0);
  expect(panned.beads).toBeLessThanOrEqual(512);
  await dialog.getByRole("button", { name: "Reset view" }).click();
  await settle();
  expect(await counts()).toEqual({ beads: 512, pegs: 1056 });
  const warm = await read();
  await dialog.getByRole("button", { name: "Rotate left" }).click();
  await settle();
  expect((await read()).contexts[0].resources).toEqual(warm.contexts[0].resources);
  const frames = (await read()).frames.length;
  await settle();
  expect((await read()).frames.length).toBe(frames);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await read()).contexts[0].lost).toBe(true);
  for (const resource of Object.values((await read()).contexts[0].resources)) {
    expect(resource.live).toBe(0);
    expect(resource.created).toBe(resource.deleted + resource.reclaimed);
  }
});

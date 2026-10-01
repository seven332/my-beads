import { test, expect, type Page } from "@playwright/test";
import { installPreviewProbe } from "../benchmarks/probe.js";
import { openPreview, supportsWebGL } from "./preview-helpers.js";

// Match physical framebuffer size so both engines cross the same pixel-error thresholds.
test.use({ deviceScaleFactor: 1 });

const read = (page: Page) => page.evaluate(() => window.previewBenchmark.snapshot());
async function settle(page: Page, count = 4) {
  await page.evaluate(async (count) => {
    for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame);
  }, count);
}
async function setup(page: Page) {
  await page.addInitScript(installPreviewProbe);
  await page.goto("./");
  await page
    .getByLabel("Open CSV")
    .setInputFiles({
      name: "Detail.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        Array.from({ length: 50 }, () => Array<string>(50).fill("H2").join(",")).join("\n"),
      ),
    });
  return supportsWebGL(page);
}

test("changes submitted detail with zoom, reuses warmed variants and releases every native handle", async ({
  page,
}) => {
  test.skip(!(await setup(page)), "WebGL2 unavailable");
  await page.evaluate(() => {
    const submitted: { indices: number; instances: number }[] = [];
    Reflect.set(window, "detailSubmissions", submitted);
    const draw = WebGL2RenderingContext.prototype.drawElementsInstanced;
    WebGL2RenderingContext.prototype.drawElementsInstanced = function (...args) {
      if ((this.canvas as HTMLCanvasElement).matches(".preview-canvas"))
        submitted.push({ indices: args[1], instances: args[4] });
      return draw.apply(this, args);
    };
  });
  const dialog = await openPreview(page, true);
  await settle(page);
  const initial = await read(page);
  const exercise = async () => {
    await dialog.getByRole("button", { name: "Reset view" }).click();
    await settle(page, 1);
    for (let i = 0; i < 8; i++) {
      await dialog.getByRole("button", { name: "Zoom out", exact: true }).click();
      await settle(page, 1);
    }
    for (let i = 0; i < 13; i++) {
      await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
      await settle(page, 1);
    }
    await settle(page);
  };
  await exercise();
  const warm = await read(page);
  await exercise();
  const repeated = await read(page);
  expect(repeated.contexts[0].resources).toEqual(warm.contexts[0].resources);
  expect(warm.contexts[0].resources.Program.created).toBe(
    initial.contexts[0].resources.Program.created,
  );
  expect(warm.contexts[0].resources.Buffer.live).toBeLessThanOrEqual(56);
  expect(warm.contexts[0].allocations).toEqual(initial.contexts[0].allocations);
  const submitted = await page.evaluate(
    () => Reflect.get(window, "detailSubmissions") as { indices: number; instances: number }[],
  );
  // RoomEnvironment uses other counts; these two identify the complete document/lattice draws.
  const beads = new Set(
    submitted.filter((draw) => draw.instances === 2500).map((draw) => draw.indices),
  );
  const pegs = new Set(
    submitted.filter((draw) => draw.instances === 2916).map((draw) => draw.indices),
  );
  expect(Math.min(...beads)).toBe(6 * 14 * 3);
  expect(Math.max(...beads)).toBe(32 * 14 * 3);
  expect(Math.min(...pegs)).toBe(4 * 4 * 3);
  expect(Math.max(...pegs)).toBe(12 * 4 * 3);
  expect(
    repeated.frames
      .filter((frame) => frame.draws === 4)
      .every((frame) => frame.triangles < 10_000_000),
  ).toBe(true);
  await settle(page);
  expect((await read(page)).frames.length).toBe(repeated.frames.length);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await read(page)).contexts[0].lost).toBe(true);
  for (const resource of Object.values((await read(page)).contexts[0].resources)) {
    expect(resource.live).toBe(0);
    expect(resource.created).toBe(resource.deleted + resource.reclaimed);
  }
});

test("cleans up a failed first-use geometry upload and can reopen", async ({ page }) => {
  test.skip(!(await setup(page)), "WebGL2 unavailable");
  const dialog = await openPreview(page, true);
  await settle(page);
  await page.evaluate(() => {
    const upload = WebGL2RenderingContext.prototype.bufferData;
    Reflect.set(
      WebGL2RenderingContext.prototype,
      "bufferData",
      function (this: WebGL2RenderingContext, ...args: unknown[]) {
        Reflect.apply(upload, this, args);
        if ((this.canvas as HTMLCanvasElement).matches(".preview-canvas")) {
          WebGL2RenderingContext.prototype.bufferData = upload;
          throw new Error("Injected detail geometry upload failure");
        }
      },
    );
  });
  // Far zoom reaches a new variant without touching document or instance data.
  for (let i = 0; i < 8; i++) {
    if (await dialog.getByRole("alert").count()) break;
    await dialog.getByRole("button", { name: "Zoom out", exact: true }).click();
    await settle(page);
  }
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect.poll(async () => (await read(page)).contexts[0].lost).toBe(true);
  for (const resource of Object.values((await read(page)).contexts[0].resources))
    expect(resource.live).toBe(0);
  await page.keyboard.press("Escape");
  await openPreview(page, true);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await read(page)).contexts[1].lost).toBe(true);
});

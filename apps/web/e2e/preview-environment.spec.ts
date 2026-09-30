import { test, expect, type Page } from "@playwright/test";
import { installPreviewProbe } from "../benchmarks/probe.js";
import { openPreview, supportsWebGL } from "./preview-helpers.js";

const read = (page: Page) => page.evaluate(() => window.previewBenchmark.snapshot());
async function settle(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame);
  });
}
async function setup(page: Page) {
  await page.addInitScript(installPreviewProbe);
  await page.goto("./");
  await page
    .getByLabel("Open CSV")
    .setInputFiles({
      name: "Environment.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("H7,H2,B15\nD22,F13,A7"),
    });
  return supportsWebGL(page);
}
async function supportsEnvironment(page: Page) {
  return page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2")!;
    const supported = Boolean(
      gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"),
    );
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return supported;
  });
}

test("reuses a bounded environment across camera, theme and resize, and releases it on close", async ({
  page,
}) => {
  const supported = await setup(page);
  test.skip(!supported || !(await supportsEnvironment(page)), "Half-float rendering unavailable");
  for (let cycle = 0; cycle < 2; cycle++) {
    const dialog = await openPreview(page, true);
    await settle(page);
    const before = await read(page);
    const context = before.contexts[cycle];
    const targets = context.allocations.filter((item) => item.width > 16 || item.height > 16);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((item) => item.width === 336 && item.height === 256)).toBe(true);
    // Only the pegboard's native buffers remain; the room's instance buffer is gone.
    expect(context.resources.Buffer.live).toBe(16);
    expect(context.resources.Texture.deleted).toBeGreaterThan(0);
    const offscreen = (snapshot: typeof before) =>
      snapshot.frames.flatMap((frame) => frame.viewports).filter((view) => view.target !== 0)
        .length;
    expect(offscreen(before)).toBeGreaterThan(0);
    await dialog.getByRole("button", { name: "Rotate left" }).click();
    await page.emulateMedia({ colorScheme: cycle === 0 ? "dark" : "light" });
    await page.setViewportSize({ width: 1200 + cycle * 100, height: 900 });
    await settle(page);
    const after = await read(page);
    expect(after.contexts).toHaveLength(cycle + 1);
    expect(after.contexts[cycle].allocations).toEqual(context.allocations);
    expect(after.contexts[cycle].resources).toEqual(context.resources);
    expect(offscreen(after)).toBe(offscreen(before));
    const draws = after.frames.reduce((sum, frame) => sum + frame.draws, 0);
    await settle(page);
    expect((await read(page)).frames.reduce((sum, frame) => sum + frame.draws, 0)).toBe(draws);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect.poll(async () => (await read(page)).contexts[cycle].lost).toBe(true);
    const closed = (await read(page)).contexts[cycle];
    // The output and temporary targets are explicitly deleted, not just context-reclaimed.
    expect(closed.resources.Texture.deleted).toBeGreaterThanOrEqual(
      context.resources.Texture.deleted + 1,
    );
    expect(closed.resources.Framebuffer.deleted).toBeGreaterThanOrEqual(2);
    expect(closed.resources.Renderbuffer.deleted).toBeGreaterThanOrEqual(1);
    for (const resource of Object.values(closed.resources)) {
      expect(resource.live).toBe(0);
      expect(resource.created).toBe(resource.deleted + resource.reclaimed);
    }
  }
});

test("keeps direct lighting usable when half-float color targets are unsupported", async ({
  page,
}) => {
  const supported = await setup(page);
  test.skip(!supported, "WebGL2 unavailable");
  await page.evaluate(() => {
    const original = WebGL2RenderingContext.prototype.getExtension;
    Reflect.set(
      WebGL2RenderingContext.prototype,
      "getExtension",
      function (this: WebGL2RenderingContext, name: string) {
        if (name === "EXT_color_buffer_float" || name === "EXT_color_buffer_half_float")
          return null;
        return Reflect.apply(original, this, [name]);
      },
    );
  });
  const dialog = await openPreview(page, true);
  await settle(page);
  const initial = await read(page);
  expect(initial.frames.some((frame) => frame.draws === 4)).toBe(true);
  expect(
    initial.contexts[0].allocations.every((item) => item.width <= 16 && item.height <= 16),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Rotate left" }).click();
  await settle(page);
  expect((await read(page)).frames.length).toBeGreaterThan(initial.frames.length);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await read(page)).contexts[0].lost).toBe(true);
});

test("releases partially allocated environment targets on initialization failure and retries", async ({
  page,
}) => {
  const supported = await setup(page);
  test.skip(!supported || !(await supportsEnvironment(page)), "Half-float rendering unavailable");
  await page.evaluate(() => {
    const original = WebGL2RenderingContext.prototype.framebufferTexture2D;
    WebGL2RenderingContext.prototype.framebufferTexture2D = function (...args) {
      original.apply(this, args);
      if ((this.canvas as HTMLCanvasElement).matches(".preview-canvas")) {
        WebGL2RenderingContext.prototype.framebufferTexture2D = original;
        throw new Error("Injected environment allocation failure");
      }
    };
  });
  const dialog = await openPreview(page, false);
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect.poll(async () => (await read(page)).contexts[0].lost).toBe(true);
  const failed = (await read(page)).contexts[0];
  expect(failed.resources.Framebuffer.created).toBeGreaterThan(0);
  for (const resource of Object.values(failed.resources)) {
    expect(resource.live).toBe(0);
    expect(resource.created).toBe(resource.deleted + resource.reclaimed);
  }
  await page.keyboard.press("Escape");
  await openPreview(page, true);
  await settle(page);
  expect((await read(page)).contexts).toHaveLength(2);
  await page.keyboard.press("Escape");
  await page.locator(".pattern-canvas").press("ArrowRight");
  await page.locator(".pattern-canvas").press("Enter");
  await expect(page.getByTestId("counts")).toContainText("6 beads");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
});

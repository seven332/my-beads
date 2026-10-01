import { expect, test, type Page } from "@playwright/test";
import { installPreviewProbe } from "../benchmarks/probe.js";
import { openPreview, supportsWebGL } from "./preview-helpers.js";

test.use({ deviceScaleFactor: 1, viewport: { width: 480, height: 480 } });
const read = (page: Page) => page.evaluate(() => window.previewBenchmark.snapshot());
async function settle(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
  });
}
async function setup(page: Page, width = 20) {
  await page.addInitScript(installPreviewProbe);
  await page.goto("./");
  await page
    .getByLabel("Open CSV")
    .setInputFiles({
      name: "Shadows.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        Array.from({ length: width === 20 ? 20 : 1 }, () =>
          Array<string>(width).fill("H2").join(","),
        ).join("\n"),
      ),
    });
  test.skip(!(await supportsWebGL(page)), "WebGL2 unavailable");
  const dialog = await openPreview(page, true);
  await settle(page);
  return dialog;
}
test("defaults off, caches stable views, refreshes detail and releases each optional target", async ({
  page,
}) => {
  const dialog = await setup(page);
  const draft = await page.evaluate(() => localStorage.getItem("my-beads.draft"));
  const toggle = dialog.getByRole("button", { name: "Cast shadows", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const initial = await read(page);
  expect(initial.contexts[0].allocations.some((item) => item.width >= 1024)).toBe(false);
  const shadowFrames = async (from: number) =>
    (await read(page)).frames
      .slice(from)
      .filter((frame) => frame.viewports.some((view) => view.target > 0 && view.width === 1024));
  await toggle.click();
  await settle(page);
  expect(await shadowFrames(initial.frames.length)).toHaveLength(1);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const enabled = await read(page);
  for (let i = 0; i < 5; i++) {
    await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
    await settle(page);
  }
  expect((await shadowFrames(enabled.frames.length)).length).toBeGreaterThan(0);
  const close = await read(page);
  await dialog.getByRole("button", { name: "Rotate left" }).click();
  await settle(page);
  expect(await shadowFrames(close.frames.length)).toHaveLength(0);
  for (let i = 0; i < 3; i++) {
    await toggle.click();
    await settle(page);
    const off = (await read(page)).contexts[0];
    for (const kind of ["Texture", "Framebuffer"])
      expect(off.resources[kind].live).toBe(initial.contexts[0].resources[kind].live);
    await toggle.click();
    await settle(page);
    expect((await read(page)).contexts[0].resources.Texture.live).toBe(
      enabled.contexts[0].resources.Texture.live,
    );
  }
  const idle = (await read(page)).frames.length;
  await settle(page);
  expect((await read(page)).frames).toHaveLength(idle);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await read(page)).contexts[0].lost).toBe(true);
  expect(
    Object.values((await read(page)).contexts[0].resources).every(
      (resource) => resource.live === 0,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("my-beads.draft"))).toBe(draft);
  await openPreview(page, true);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("explains unavailable density without allocating a shadow target", async ({ page }) => {
  const dialog = await setup(page, 256);
  await expect(dialog.getByRole("button", { name: "Cast shadows", exact: true })).toBeDisabled();
  await expect(dialog.locator(".preview-footer")).toContainText(
    "unavailable for this board size or device",
  );
  expect(
    (await read(page)).contexts[0].allocations.some(
      (item) => item.width >= 1024 && item.width === item.height,
    ),
  ).toBe(false);
});

test("disposes a partial shadow allocation and reopens with shadows off", async ({ page }) => {
  const dialog = await setup(page);
  await page.evaluate(() => {
    const original = WebGL2RenderingContext.prototype.framebufferTexture2D;
    WebGL2RenderingContext.prototype.framebufferTexture2D = function (...args) {
      original.apply(this, args);
      if (
        (this.canvas as HTMLCanvasElement).matches(".preview-canvas") &&
        args[1] === this.DEPTH_ATTACHMENT
      ) {
        WebGL2RenderingContext.prototype.framebufferTexture2D = original;
        throw new Error("Injected shadow failure");
      }
    };
  });
  await dialog.getByRole("button", { name: "Cast shadows", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect.poll(async () => (await read(page)).contexts[0].lost).toBe(true);
  const failed = (await read(page)).contexts[0];
  expect(failed.allocations.some((item) => item.width === 1024)).toBe(true);
  for (const resource of Object.values(failed.resources)) {
    expect(resource.live).toBe(0);
    expect(resource.created).toBe(resource.deleted + resource.reclaimed);
  }
  await page.keyboard.press("Escape");
  await openPreview(page, true);
  await expect(dialog.getByRole("button", { name: "Cast shadows", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("supports optional shadows with the direct-light environment fallback", async ({ page }) => {
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension = new Proxy(original, {
      apply(target, context, args) {
        if (["EXT_color_buffer_float", "EXT_color_buffer_half_float"].includes(args[0]))
          return null;
        return Reflect.apply(target, context, args);
      },
    });
  });
  const dialog = await setup(page);
  const before = await read(page);
  await dialog.getByRole("button", { name: "Cast shadows", exact: true }).click();
  await settle(page);
  await expect(dialog.locator(".preview-stage")).toHaveAttribute("data-status", "ready");
  expect(
    (await read(page)).frames
      .slice(before.frames.length)
      .some((frame) => frame.viewports.some((view) => view.target > 0 && view.width === 1024)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await read(page)).contexts[0].lost).toBe(true);
  expect(
    Object.values((await read(page)).contexts[0].resources).every(
      (resource) => resource.live === 0,
    ),
  ).toBe(true);
});

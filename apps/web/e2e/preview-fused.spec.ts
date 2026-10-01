import { expect, test, type Page } from "@playwright/test";
import { installPreviewProbe } from "../benchmarks/probe.js";
import { openPreview, supportsWebGL } from "./preview-helpers.js";

test.use({ deviceScaleFactor: 1, viewport: { width: 600, height: 600 } });
const read = (page: Page) => page.evaluate(() => window.previewBenchmark.snapshot());
async function settle(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
  });
}
async function setup(page: Page, csv = "H2,H7,H2\nB15,,D22\nH2,H2,H2") {
  await page.addInitScript(installPreviewProbe);
  await page.goto("./");
  await page
    .getByLabel("Open CSV")
    .setInputFiles({ name: "Fused.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  test.skip(!(await supportsWebGL(page)), "WebGL2 unavailable");
  const dialog = await openPreview(page, true);
  await settle(page);
  return dialog;
}

test("reuses one context and fused buffers, omits board draws, and refreshes only changed shadows", async ({
  page,
}) => {
  const dialog = await setup(page);
  const draft = await page.evaluate(() => localStorage.getItem("my-beads.draft"));
  await dialog.getByRole("button", { name: "Cast shadows", exact: true }).click();
  await settle(page);
  await page.evaluate(() => window.previewBenchmark.phase("fused"));
  await dialog.getByRole("button", { name: "Fused", exact: true }).click();
  await settle(page);
  const fused = await read(page);
  // Exactly the finished mesh in the depth pass and visible pass: no slab, guides or pegs.
  const frames = fused.frames.filter((frame) => frame.phase === "fused" && frame.draws);
  expect(frames[0].draws).toBe(2);
  expect(frames[0].viewports.some((view) => view.target > 0)).toBe(true);
  expect(fused.contexts).toHaveLength(1);
  await page.evaluate(() => window.previewBenchmark.phase("orbit"));
  await dialog.getByRole("button", { name: "Rotate left" }).click();
  await settle(page);
  const orbit = (await read(page)).frames.filter((frame) => frame.phase === "orbit" && frame.draws);
  expect(
    orbit.every((frame) => frame.draws === 1 && frame.viewports.every((view) => view.target === 0)),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Cast shadows", exact: true }).click();
  await settle(page);
  const buffers = (await read(page)).contexts[0].resources.Buffer.created;
  for (let i = 0; i < 3; i++) {
    await dialog.getByRole("button", { name: "On board", exact: true }).click();
    await settle(page);
    await dialog.getByRole("button", { name: "Fused", exact: true }).click();
    await settle(page);
  }
  expect((await read(page)).contexts[0].resources.Buffer.created).toBe(buffers);
  const idle = (await read(page)).frames.length;
  await settle(page);
  expect((await read(page)).frames).toHaveLength(idle);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await read(page)).contexts[0].lost).toBe(true);
  expect(Object.values((await read(page)).contexts[0].resources).every((r) => r.live === 0)).toBe(
    true,
  );
  expect(await page.evaluate(() => localStorage.getItem("my-beads.draft"))).toBe(draft);
  await openPreview(page, true);
  await expect(dialog.getByRole("button", { name: "On board", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("describes an empty fused result and keeps mode controls usable on mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await setup(page, ",\n,");
  await dialog.getByRole("button", { name: "Fused", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Add beads");
  for (const button of await dialog.getByRole("button").all()) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await dialog.getByRole("button", { name: "On board", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("releases a failed fused upload and reopens the on-board preview", async ({ page }) => {
  const dialog = await setup(page);
  await page.evaluate(() => {
    const original = WebGL2RenderingContext.prototype.bufferData;
    WebGL2RenderingContext.prototype.bufferData = new Proxy(original, {
      apply(target, context, args) {
        if ((context.canvas as HTMLCanvasElement).matches(".preview-canvas")) {
          WebGL2RenderingContext.prototype.bufferData = original;
          throw new Error("Injected fused upload failure");
        }
        return Reflect.apply(target, context, args);
      },
    });
  });
  await dialog.getByRole("button", { name: "Fused", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("keep editing");
  await expect.poll(async () => (await read(page)).contexts[0].lost).toBe(true);
  expect(Object.values((await read(page)).contexts[0].resources).every((r) => r.live === 0)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await openPreview(page, true);
  await expect(dialog.getByRole("button", { name: "On board", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

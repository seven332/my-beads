import { test, expect } from "@playwright/test";
import { installPreviewProbe } from "../benchmarks/probe.js";
import { openPreview, supportsWebGL } from "./preview-helpers.js";

test("benchmark probe counts actual scene submissions and context-owned resources", async ({
  page,
}) => {
  await page.addInitScript(installPreviewProbe);
  await page.goto("./");
  await page
    .getByLabel("Open CSV")
    .setInputFiles({
      name: "Probe.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("H7,,H2\n,B15,"),
    });
  const supported = await supportsWebGL(page);
  const dialog = await openPreview(page, supported);
  if (!supported) return;
  const frames = () =>
    page.evaluate(async () => {
      for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame);
    });
  const read = () => page.evaluate(() => window.previewBenchmark.snapshot());
  await frames();
  const snapshot = await read();
  // 3 hollow beads (280 triangles each), 42 pegs (32 each), slab (12), guides (4).
  expect(snapshot.frames.some((frame) => frame.draws === 4 && frame.triangles === 2200)).toBe(true);
  expect(snapshot.contexts).toHaveLength(1);
  expect(snapshot.contexts[0].resources.Buffer.live).toBeGreaterThan(0);
  expect(snapshot.contexts[0].buffer.width).toBeGreaterThan(0);
  expect(snapshot.openings).toHaveLength(1);
  const draws = snapshot.frames.reduce((sum, frame) => sum + frame.draws, 0);
  await frames();
  expect((await read()).frames.reduce((sum, frame) => sum + frame.draws, 0)).toBe(draws);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await read()).contexts[0].lost).toBe(true);
  const closed = (await read()).contexts[0];
  expect(closed.resources.Buffer.deleted).toBeGreaterThan(0);
  for (const resource of Object.values(closed.resources)) {
    expect(resource.live).toBe(0);
    expect(resource.created).toBe(resource.deleted + resource.reclaimed);
  }
});

import { test, expect } from "@playwright/test";
import { openPreview, supportsWebGL } from "./preview-helpers.js";

test("closing and reopening releases document keyboard listeners while holding Control", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  const supported = await supportsWebGL(page);
  if (!supported) {
    await openPreview(page, false);
    await page.keyboard.press("Escape");
    return;
  }
  await page.evaluate(() => {
    const listeners = new Set<EventListenerOrEventListenerObject>();
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    document.addEventListener = (...args: Parameters<typeof add>) => {
      if (args[0] === "keydown" || args[0] === "keyup") listeners.add(args[1]);
      add(...args);
    };
    document.removeEventListener = (...args: Parameters<typeof remove>) => {
      if (args[0] === "keydown" || args[0] === "keyup") listeners.delete(args[1]);
      remove(...args);
    };
    Reflect.set(window, "previewKeyListenerCount", () => listeners.size);
  });
  const count = () => page.evaluate(() => Reflect.get(window, "previewKeyListenerCount")());
  for (let i = 0; i < 2; i++) {
    const dialog = await openPreview(page, true);
    expect(await count()).toBe(1);
    await page.keyboard.down("Control");
    expect(await count()).toBe(2);
    // Control-click is a context-menu gesture on macOS; Escape closes with the key held.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(await count()).toBe(0);
    await page.keyboard.up("Control");
  }
});

test("draws every instance on demand, changes the camera, and releases GPU resources on close", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByLabel("Open CSV")
    .setInputFiles({
      name: "Colors.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("H7,,H2\n,B15,"),
    });
  const supported = await supportsWebGL(page);
  if (!supported) {
    const dialog = await openPreview(page, false);
    await expect(dialog.getByRole("alert")).toContainText("keep editing");
    return;
  }
  await page.evaluate(() => {
    const probe = { draws: 0, instances: [] as number[], deleted: 0, camera: "" };
    Reflect.set(window, "gpuProbe", probe);
    const gl = WebGL2RenderingContext.prototype;
    const draw = gl.drawElementsInstanced;
    gl.drawElementsInstanced = function (...args) {
      probe.draws++;
      probe.instances.push(args[4]);
      return draw.apply(this, args);
    };
    const remove = gl.deleteBuffer;
    gl.deleteBuffer = function (buffer) {
      probe.deleted++;
      return remove.call(this, buffer);
    };
    const matrix = gl.uniformMatrix4fv;
    gl.uniformMatrix4fv = function (...args) {
      probe.camera = Array.from(args[2]).join(",");
      return matrix.apply(this, args);
    };
  });
  const read = () =>
    page.evaluate(
      () =>
        Reflect.get(window, "gpuProbe") as {
          draws: number;
          instances: number[];
          deleted: number;
          camera: string;
        },
    );
  const frames = () =>
    page.evaluate(async () => {
      for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
    });
  const dialog = await openPreview(page, true);
  await frames();
  const first = await read();
  expect(first.instances).toContain(3);
  // The 3 by 2 pattern sits on a 7 by 6 peg lattice, including the two-cell border.
  expect(first.instances).toContain(42);
  await frames();
  expect((await read()).draws).toBe(first.draws);
  await dialog.getByRole("button", { name: "Rotate left" }).click();
  await expect.poll(async () => (await read()).camera).not.toBe(first.camera);
  await dialog.getByRole("button", { name: "Reset view" }).click();
  await expect.poll(async () => (await read()).camera).toBe(first.camera);
  await page.keyboard.press("Escape");
  expect((await read()).deleted).toBeGreaterThan(0);
  const stopped = (await read()).draws;
  await frames();
  expect((await read()).draws).toBe(stopped);
});

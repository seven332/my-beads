import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parsePatternCsv } from "@my-beads/core";
import { openPreview, supportsWebGL } from "./preview-helpers.js";
import { fitCoordinates, openExport, selectChoice } from "./helpers.js";

test("previews the current board and isolates viewing from editing, history, drafts and export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByLabel("Open CSV")
    .setInputFiles({
      name: "Board.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("H7,,H2\n,B15,\n,,"),
    });
  const supported = await supportsWebGL(page);
  const canvas = page.locator(".pattern-canvas");
  const originalCanvas = await canvas.elementHandle();
  await canvas.press("Enter");
  await canvas.press("ArrowRight");
  await canvas.press("Enter");
  await expect(page.getByTestId("counts")).toContainText("4 beads");
  const draft = await page.evaluate(() => localStorage.getItem("my-beads.draft"));
  const zoom = await page.getByLabel("Zoom level").textContent();
  const dialog = await openPreview(page, supported);
  await expect(dialog.locator(".preview-summary")).toContainText("3 × 3 cells · 4 beads");
  if (supported) {
    await dialog.getByRole("button", { name: "Fused", exact: true }).click();
    const scene = dialog.getByRole("img", { name: "3D fused artwork preview" });
    const box = (await scene.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 50, { steps: 5 });
    await page.mouse.up();
    await page.mouse.wheel(0, -100);
    await dialog.getByRole("button", { name: "Rotate left" }).click();
    await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
    await dialog.getByRole("button", { name: "Reset view" }).click();
  }
  await page.keyboard.press("e");
  await page.keyboard.press("g");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Meta+z");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "3D preview", exact: true })).toBeFocused();
  expect(
    await originalCanvas!.evaluate((node) => node === document.querySelector(".pattern-canvas")),
  ).toBe(true);
  await expect(page.getByRole("button", { name: "Pencil", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Zoom level")).toHaveText(zoom!);
  expect(await page.evaluate(() => localStorage.getItem("my-beads.draft"))).toBe(draft);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("counts")).toContainText("3 beads");
  await openPreview(page, supported);
  await expect(dialog.locator(".preview-summary")).toContainText("3 beads");
  await dialog.getByRole("button", { name: "Close 3D preview" }).click();
  await openExport(page);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await pending;
  expect(parsePatternCsv(await readFile((await download.path())!, "utf8"))).toEqual([
    ["H7", null, "H2"],
    [null, "B15", null],
    [null, null, null],
  ]);
  expect(errors).toEqual([]);
});

test("commits and releases a captured stroke before modal focus; returning cannot replay it", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByLabel("Open CSV")
    .setInputFiles({ name: "Empty.csv", mimeType: "text/csv", buffer: Buffer.from(",,\n,,") });
  const point = (await fitCoordinates(page, 3, 2)).cell(0, 0);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await expect(page.getByTestId("counts")).toContainText("1 bead");
  // A second contact activates the entry while the drawing pointer remains captured.
  await page.locator(".preview-open").evaluate((node) => {
    node.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 2, pointerType: "touch" }),
    );
    (node as HTMLButtonElement).focus();
    (node as HTMLButtonElement).click();
  });
  await page.getByRole("button", { name: "Close 3D preview" }).click();
  await page.mouse.move(point.x + 32, point.y);
  await page.mouse.up();
  await expect(page.getByTestId("counts")).toContainText("1 bead");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("counts")).toContainText("0 beads");
});

test("unavailable graphics and lost context leave an editable document and allow retry", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  const supported = await supportsWebGL(page);
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).includes("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
    Reflect.set(window, "restoreContext", () => {
      HTMLCanvasElement.prototype.getContext = original;
    });
  });
  const dialog = await openPreview(page, false);
  await expect(dialog.getByRole("alert")).toContainText("keep editing");
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    Reflect.get(window, "restoreContext")();
  });
  await openPreview(page, supported);
  if (supported) {
    await dialog.locator("canvas").evaluate((node) => {
      const gl = (node as HTMLCanvasElement).getContext("webgl2")!;
      const extension = gl.getExtension("WEBGL_lose_context");
      if (extension) extension.loseContext();
      else node.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    });
    await expect(dialog.locator(".preview-stage")).toHaveAttribute("data-status", "failed");
    await page.keyboard.press("Escape");
    await openPreview(page, true);
  }
  await page.keyboard.press("Escape");
  await page.locator(".pattern-canvas").press("Enter");
  await expect(page.getByTestId("counts")).toContainText("1 bead");
});

test("mobile Chinese dark preview fits the viewport and provides touch-sized controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("./");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  await selectChoice(page.getByRole("combobox", { name: "Language", exact: true }), "zh-CN");
  await page.getByRole("button", { name: "3D 预览", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "3D 预览" });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  expect(box.width).toBe(390);
  expect(box.height).toBe(844);
  for (const button of await dialog.getByRole("button").all()) {
    const bounds = (await button.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  }
  await expect(dialog).toHaveCSS("background-color", "rgb(36, 43, 38)");
  await dialog.getByRole("button", { name: "关闭 3D 预览" }).click();
  await expect(page.getByRole("button", { name: "3D 预览", exact: true })).toBeFocused();
});

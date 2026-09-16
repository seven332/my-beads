import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { parsePatternCsv } from "@my-beads/core";
import { selectChoice, fitCoordinates, openExport, closeExport } from "./helpers.js";

async function scene(page: Page, csv = "H7,H2,,") {
  await page.goto("/");
  await page
    .getByLabel("Open CSV")
    .setInputFiles({ name: "theme.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  const canvas = page.getByRole("img", { name: "Pattern canvas" });
  const { box, cell, zoom } = await fitCoordinates(page, 4, 1);
  const pixel = (column: number, offset = 0) =>
    canvas.evaluate(
      (element, point) => {
        const canvas = element as HTMLCanvasElement,
          rect = canvas.getBoundingClientRect();
        return [
          ...canvas
            .getContext("2d")!
            .getImageData(
              Math.floor(((point.x - rect.x) * canvas.width) / rect.width),
              Math.floor(((point.y - rect.y) * canvas.height) / rect.height),
              1,
              1,
            ).data,
        ];
      },
      { x: cell(column, 0).x + offset, y: cell(column, 0).y },
    );
  return { canvas, box, cell, pixel, zoom };
}

test("system changes repaint auxiliary pixels and preserve the selected cell, MARD fills and viewport", async ({
  page,
}) => {
  const { canvas, box, cell, pixel, zoom } = await scene(page);
  await expect.poll(() => pixel(2)).toEqual([245, 246, 242, 255]);
  await page.getByRole("button", { name: "Eyedropper", exact: true }).click();
  await page.mouse.click(cell(0, 0).x, cell(0, 0).y);
  const canvasHandle = await canvas.elementHandle();
  const draft = await page.evaluate(() => localStorage.getItem("my-beads.draft"));
  await expect.poll(() => pixel(0, -zoom / 2 + 1)).toEqual([239, 117, 64, 255]);
  // No pointer, focus, wheel or edit event follows the OS theme change.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => pixel(2)).toEqual([56, 60, 62, 255]);
  await expect.poll(() => pixel(0, -zoom / 2 + 1)).toEqual([255, 172, 118, 255]);
  expect(await pixel(0)).toEqual([0, 0, 0, 255]);
  expect(await pixel(1)).toEqual([255, 255, 255, 255]);
  expect(await canvas.boundingBox()).toEqual(box);
  expect(
    await canvasHandle!.evaluate((node) => node === document.querySelector(".pattern-canvas")),
  ).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("my-beads.draft"))).toBe(draft);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Locate H7 on canvas", exact: true }).click();
  await expect.poll(() => pixel(1)).not.toEqual([255, 255, 255, 255]);
  const masked = await pixel(1);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => pixel(1)).not.toEqual(masked);
  expect(await pixel(0)).toEqual([0, 0, 0, 255]);
});

test("an OS theme change during a stroke preserves pointer capture and one undo step", async ({
  page,
}) => {
  const { cell, pixel } = await scene(page, "H2,H2,H2,H2");
  await page.mouse.move(cell(0, 0).x, cell(0, 0).y);
  await page.mouse.down();
  await expect.poll(() => pixel(0)).toEqual([0, 0, 0, 255]);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.mouse.move(cell(2, 0).x, cell(2, 0).y);
  await page.mouse.up();
  await expect.poll(() => pixel(1)).toEqual([0, 0, 0, 255]);
  await expect.poll(() => pixel(2)).toEqual([0, 0, 0, 255]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => pixel(0)).toEqual([255, 255, 255, 255]);
  await expect.poll(() => pixel(2)).toEqual([255, 255, 255, 255]);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

test("saved appearance works across creation and editing, OS changes and reloads", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const appearance = page.getByRole("combobox", { name: "Appearance" });
  await expect(appearance).toHaveJSProperty("value", "system");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#191d1b");
  await selectChoice(appearance, "light");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f4f3ef");
  await page.reload();
  await expect(appearance).toHaveJSProperty("value", "light");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  await selectChoice(appearance, "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await selectChoice(appearance, "system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "New pattern", exact: true }).click();
  await expect(appearance).toHaveJSProperty("value", "system");
});

test("dark mode preserves CSV, transparent pixels and English printable chart output", async ({
  page,
}) => {
  await scene(page);
  await selectChoice(page.getByRole("combobox", { name: "Appearance" }), "dark");
  await openExport(page);
  const download = async () => {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const csv = await download();
  expect(parsePatternCsv(csv.toString())).toEqual([["H7", "H2", null, null]]);
  await selectChoice(page.getByRole("combobox", { name: "Export format", exact: true }), "pixel");
  await page.getByLabel("Pixel scale").fill("1");
  const pixels = PNG.sync.read(await download());
  expect([pixels.width, pixels.height]).toEqual([4, 1]);
  expect([...pixels.data]).toEqual([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
  await selectChoice(page.getByRole("combobox", { name: "Export format", exact: true }), "svg");
  const darkChart = await download();
  expect(darkChart.toString()).toContain("MARD 221");
  await closeExport(page);
  await selectChoice(page.getByRole("combobox", { name: "Appearance" }), "light");
  await openExport(page);
  expect(await download()).toEqual(darkChart);
});

test("an open image import changes appearance without resetting source pixels or unfinished settings", async ({
  page,
}) => {
  await page.goto("/");
  const png = new PNG({ width: 2, height: 1 });
  png.data.set([0, 0, 0, 255, 255, 255, 255, 255]);
  await page
    .getByLabel("Open image", { exact: true })
    .setInputFiles({ name: "Source.png", mimeType: "image/png", buffer: PNG.sync.write(png) });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("img", { name: "MARD preview" })).toBeVisible();
  const preview = page.locator(".image-preview").first();
  const element = await preview.elementHandle();
  const pixels = () =>
    preview.evaluate((node) => {
      const canvas = node as HTMLCanvasElement;
      return [...canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data];
    });
  const before = await pixels();
  const columns = dialog.locator('input[name="columns"]');
  await columns.fill("7");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(dialog).toHaveCSS("background-color", "rgb(36, 43, 38)");
  await expect(columns).toHaveValue("7");
  expect(await pixels()).toEqual(before);
  expect(await element!.evaluate((node) => node === document.querySelector(".image-preview"))).toBe(
    true,
  );
});

for (const locale of ["en-US", "zh-CN"]) {
  test(`appearance is accessible in ${locale} on narrow creation and editing pages`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    await selectChoice(page.getByRole("combobox", { name: "Language", exact: true }), locale);
    const label = locale === "en-US" ? "Appearance" : "外观";
    const appearance = page.getByRole("combobox", { name: label });
    for (const editing of [false, true]) {
      if (editing) await page.locator(".blank-form button").click();
      const box = (await appearance.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(32);
      expect(box.height).toBeGreaterThanOrEqual(32);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      // The icon and its surrounding trigger both activate the same control.
      expect(
        await appearance.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return node.contains(
            document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
          );
        }),
      ).toBe(true);
      await appearance.focus();
      await appearance.press("ArrowDown");
      await expect(appearance).toHaveCSS("outline-style", "solid");
      await appearance.press("Escape");
      await selectChoice(appearance, "dark");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  });
}

import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { parsePatternCsv, defaultPalette, type PatternGrid } from "@my-beads/core";
import { startNew, openExport, closeExport } from "./helpers.js";

function enlargedImage() {
  const png = new PNG({ width: 1000, height: 1000 });
  for (let y = 0; y < 1000; y++) for (let x = 0; x < 1000; x++) {
    const offset = (y * 1000 + x) * 4;
    const value = x < 400 ? 0 : 255;
    png.data[offset] = value; png.data[offset + 1] = value; png.data[offset + 2] = value;
    png.data[offset + 3] = x < 700 ? 255 : 0;
  }
  return PNG.sync.write(png);
}
async function csv(page: Page, content: string, name = "Before.csv") {
  await page.getByLabel("Open CSV").setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(content) });
  await expect(page.getByLabel("Pattern title")).toHaveValue(name.replace(/\.csv$/, ""));
}
async function download(page: Page, format: string) {
  await openExport(page);
  await page.getByLabel("Export format").selectOption(format);
  if (format === "pixel") await page.getByLabel("Pixel scale").fill("1");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const result = await readFile((await (await pending).path())!);
  await closeExport(page);
  return result;
}
function pixelsMatch(bytes: Buffer, grid: PatternGrid) {
  const png = PNG.sync.read(bytes);
  expect([png.width, png.height]).toEqual([grid[0].length, grid.length]);
  let mismatches = 0;
  grid.forEach((row, y) => row.forEach((code, x) => {
    const offset = (y * png.width + x) * 4;
    if (!code) { if (png.data[offset + 3] !== 0) mismatches++; }
    else {
      const hex = defaultPalette.colors[code];
      if ([1, 3, 5].some((i, channel) => png.data[offset + channel] !== parseInt(hex.slice(i, i + 2), 16)) || png.data[offset + 3] !== 255) mismatches++;
    }
  }));
  expect(mismatches).toBe(0);
}

test("imports enlarged PNG with explicit sampling, override, edit, exports and draft recovery", async ({ page }) => {
  await page.goto("/"); await csv(page, "H5");
  await startNew(page);
  await page.getByLabel("Open image", { exact: true }).setInputFiles({ name: "Pixel design.png", mimeType: "image/png", buffer: enlargedImage() });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("img", { name: "MARD preview" })).toBeVisible();
  await expect(page.getByTestId("counts")).toHaveText("1 bead · 1 color");
  await dialog.getByLabel("Target columns").fill("50"); await dialog.getByLabel("Target rows").fill("50");
  await expect(dialog.getByRole("button", { name: "Apply image" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Update preview" }).click();
  await expect(dialog.getByText("MARD 221 · 50 × 50 cells · 1,750 beads", { exact: true })).toBeVisible();
  const white = dialog.getByLabel("Map #FFFFFF", { exact: true });
  await white.fill("H5"); await white.press("Tab");
  await expect(white).toHaveValue("H5");
  await dialog.getByRole("button", { name: "Apply image" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("counts")).toHaveText("1,750 beads · 2 colors");
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  await page.getByRole("img", { name: "Pattern canvas" }).focus();
  await page.getByRole("img", { name: "Pattern canvas" }).press("Enter");
  await expect(page.getByTestId("counts")).toHaveText("1,749 beads · 2 colors");
  const expected = Array.from({ length: 50 }, () => Array.from({ length: 50 }, (_, x) => x < 20 ? "H7" : x < 35 ? "H5" : null));
  expected[0][0] = null;
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(expected);
  pixelsMatch(await download(page, "pixel"), expected);
  await expect(page.getByLabel("Draft status")).toContainText("saved on this device");
  await page.reload();
  await expect(page.getByLabel("Draft status")).toContainText("Recovered your saved draft");
  await expect(page.getByLabel("Pattern title")).toHaveValue("Pixel design");
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(expected);
});

test("cancel and invalid PNG preserve the active document; WebP applies through the same dialog", async ({ page }) => {
  await page.goto("/"); await csv(page, 'H5,""\n"",H7');
  const before = [["H5", null], [null, "H7"]];
  await startNew(page);
  await page.getByLabel("Open image", { exact: true }).setInputFiles({ name: "preview.png", mimeType: "image/png", buffer: enlargedImage() });
  await expect(page.getByRole("img", { name: "MARD preview" })).toBeVisible();
  await page.getByRole("dialog").press("Escape");
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(before);
  await startNew(page);
  await page.getByLabel("Open image", { exact: true }).setInputFiles({ name: "invalid.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("could not be decoded");
  await expect(page.getByRole("button", { name: "Apply image" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(before);
  await startNew(page);
  await page.getByLabel("Open image", { exact: true }).setInputFiles(fileURLToPath(new URL("../../../templates/hollow-knight/king-zote-vengefly.webp", import.meta.url)));
  await expect(page.getByRole("dialog").getByText("Sampled source · 198 × 300 pixels", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply image" }).click();
  await expect(page.getByLabel("Pattern title")).toHaveValue("king-zote-vengefly");
  const grid = parsePatternCsv((await download(page, "csv")).toString());
  expect([grid[0].length, grid.length]).toEqual([2, 2]);
  expect(grid.flat().filter(Boolean).length).toBeGreaterThan(0);
});

test("invalid settings preserve work and mappings honor series and distinct choices", async ({ page }) => {
  await page.goto("/"); await csv(page, "H7");
  await startNew(page);
  await page.getByLabel("Open image", { exact: true }).setInputFiles({ name: "colors.png", mimeType: "image/png", buffer: enlargedImage() });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("img", { name: "MARD preview" })).toBeVisible();
  await dialog.getByLabel("Target columns").fill("0");
  await dialog.getByRole("button", { name: "Update preview" }).click();
  await expect(dialog.getByRole("alert")).toContainText("dimensions");
  await expect(dialog.getByRole("button", { name: "Apply image" })).toBeDisabled();
  await dialog.getByLabel("Target columns").fill("50");
  await dialog.getByLabel("MARD series").fill("H");
  await dialog.getByLabel("Distinct assignments").check();
  await dialog.getByLabel("Preserve chroma").uncheck();
  await dialog.getByRole("button", { name: "Update preview" }).click();
  await expect(dialog.getByLabel("Map #000000")).toHaveAttribute("placeholder", "Auto · H7");
  await expect(dialog.getByLabel("Map #FFFFFF")).toHaveAttribute("placeholder", "Auto · H2");
  await dialog.getByLabel("Map #000000").fill("H2"); await dialog.getByLabel("Map #000000").press("Tab");
  await expect(dialog.getByLabel("Map #FFFFFF")).not.toHaveAttribute("placeholder", "Auto · H2");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual([["H7"]]);
});

test("invalid mappings block Apply across edits to other rows until corrected", async ({ page }) => {
  await page.goto("/"); await csv(page, "H7,H2");
  await startNew(page);
  await page.getByLabel("Open image", { exact: true }).setInputFiles({ name: "colors.png", mimeType: "image/png", buffer: enlargedImage() });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("img", { name: "MARD preview" })).toBeVisible();
  await dialog.getByLabel("Target columns").fill("50");
  await dialog.getByRole("button", { name: "Update preview" }).click();
  const black = dialog.getByLabel("Map #000000", { exact: true });
  const white = dialog.getByLabel("Map #FFFFFF", { exact: true });
  await black.fill("BAD"); await black.press("Tab");
  await expect(dialog.getByRole("alert")).toContainText("Overrides");
  await white.fill("H5"); await white.press("Tab");
  await expect(black).toHaveValue("BAD"); await expect(white).toHaveValue("H5");
  await expect(dialog.getByRole("alert")).toContainText("Overrides");
  await expect(dialog.getByRole("button", { name: "Apply image" })).toBeDisabled();
  await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
  await black.fill(""); await black.press("Tab");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(white).toHaveValue("H5");
  await dialog.getByRole("button", { name: "Apply image" }).click();
  const expected = [Array.from({ length: 50 }, (_, x) => x < 20 ? "H7" : x < 35 ? "H5" : null)];
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(expected);
});

test("image dialog isolates undo and redo from the pattern and saved draft", async ({ page }) => {
  await page.goto("/"); await csv(page, 'H5,"",""');
  const canvas = page.getByRole("img", { name: "Pattern canvas" });
  await canvas.focus(); await canvas.press("ArrowRight"); await canvas.press("Enter");
  await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
  await canvas.press("ArrowRight"); await canvas.press("Enter");
  await expect(page.getByTestId("counts")).toHaveText("3 beads · 2 colors");
  await canvas.press("Control+z");
  await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
  const before = [["H5", "H7", null]];
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("my-beads.draft")!).grid)).toEqual(before);
  const saved = await page.evaluate(() => localStorage.getItem("my-beads.draft"));
  const file = { name: "Preview.png", mimeType: "image/png", buffer: enlargedImage() };
  await startNew(page);
  await page.getByLabel("Open image", { exact: true }).setInputFiles(file);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("img", { name: "MARD preview" })).toBeVisible();
  for (const key of ["Control+z", "Control+Shift+z", "Meta+z", "Meta+Shift+z"]) {
    await dialog.getByRole("button", { name: "Update preview" }).press(key);
    await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
    expect(await page.evaluate(() => localStorage.getItem("my-beads.draft"))).toBe(saved);
  }
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(before);
  await canvas.focus(); await canvas.press("Control+z");
  await expect(page.getByTestId("counts")).toHaveText("1 bead · 1 color");
  await canvas.press("Control+Shift+z");
  await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
  await startNew(page);
  await page.getByLabel("Open image", { exact: true }).setInputFiles(file);
  await expect(dialog.getByRole("img", { name: "MARD preview" })).toBeVisible();
  await dialog.getByRole("button", { name: "Update preview" }).press("Control+z");
  await dialog.getByRole("button", { name: "Apply image" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Pattern title")).toHaveValue("Preview");
});

test("corrupt drafts survive edits until explicit replacement", async ({ page }) => {
  await page.goto("/"); await page.evaluate(() => localStorage.setItem("my-beads.draft", '{"version":99}'));
  await page.reload();
  await expect(page.getByLabel("Draft status")).toContainText("unsupported version");
  await csv(page, "H5");
  expect(await page.evaluate(() => localStorage.getItem("my-beads.draft"))).toBe('{"version":99}');
  await page.getByRole("button", { name: "Replace saved draft" }).click();
  await expect(page.getByLabel("Draft status")).toContainText("saved on this device");
  await page.reload(); expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual([["H5"]]);
});

test("reload during a captured stroke recovers only the previously committed grid", async ({ page }) => {
  await page.goto("/"); await csv(page, 'H5,""');
  await expect(page.getByLabel("Draft status")).toContainText("saved on this device");
  await page.getByRole("button", { name: "Fit to window" }).click();
  const box = (await page.getByRole("img", { name: "Pattern canvas" }).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 + 16, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
  await page.reload(); await page.mouse.up();
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual([["H5", null]]);
});

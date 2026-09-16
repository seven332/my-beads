import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { parsePatternCsv, defaultPalette, type PatternGrid } from "@my-beads/core";
import { selectChoice, startNew, openExport, closeExport, fitCoordinates } from "./helpers.js";
import { sampleWebp } from "./fixtures.js";

function enlargedImage() {
  const png = new PNG({ width: 1000, height: 1000 });
  for (let y = 0; y < 1000; y++)
    for (let x = 0; x < 1000; x++) {
      const offset = (y * 1000 + x) * 4;
      const value = x < 400 ? 0 : 255;
      png.data[offset] = value;
      png.data[offset + 1] = value;
      png.data[offset + 2] = value;
      png.data[offset + 3] = x < 700 ? 255 : 0;
    }
  return PNG.sync.write(png);
}
async function csv(page: Page, content: string, name = "Before.csv") {
  await page
    .getByLabel("Open CSV")
    .setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(content) });
  await expect(page.getByLabel("Pattern title")).toHaveValue(name.replace(/\.csv$/, ""));
}
async function download(page: Page, format: string) {
  await openExport(page);
  await selectChoice(page.getByRole("combobox", { name: "Export format", exact: true }), format);
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
  grid.forEach((row, y) =>
    row.forEach((code, x) => {
      const offset = (y * png.width + x) * 4;
      if (!code) {
        if (png.data[offset + 3] !== 0) mismatches++;
      } else {
        const hex = defaultPalette.colors[code];
        if (
          [1, 3, 5].some(
            (i, channel) => png.data[offset + channel] !== parseInt(hex.slice(i, i + 2), 16),
          ) ||
          png.data[offset + 3] !== 255
        )
          mismatches++;
      }
    }),
  );
  expect(mismatches).toBe(0);
}

test("imports enlarged PNG with explicit sampling, override, edit, exports and draft recovery", async ({
  page,
}) => {
  await page.goto("/");
  await csv(page, "H5");
  await startNew(page);
  await page
    .getByLabel("Open image", { exact: true })
    .setInputFiles({ name: "Pixel design.png", mimeType: "image/png", buffer: enlargedImage() });
  const dialog = page.getByRole("dialog");
  await selectChoice(dialog.getByRole("combobox", { name: "Image processing" }), "pixel");
  await dialog.getByLabel("Lock aspect ratio").uncheck();
  await expect(dialog.getByRole("img", { name: "MARD preview" })).toBeVisible();
  await expect(dialog.getByLabel("MARD series", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("counts")).toHaveText("1 bead · 1 color");
  await dialog.getByLabel("Target columns").fill("50");
  await dialog.getByLabel("Target rows").fill("50");
  await expect(dialog.getByRole("button", { name: "Update preview" })).toHaveCount(0);
  await expect(
    dialog.getByText("MARD 221 · 2 colors · 50 × 50 cells · 1,750 beads", { exact: true }),
  ).toBeVisible();
  expect(
    await dialog
      .locator("#image-mard-codes option")
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)),
  ).toEqual(Object.keys(defaultPalette.colors));
  const white = dialog.getByLabel("Map #FFFFFF", { exact: true });
  await white.fill("B15");
  await white.press("Tab");
  await expect(white).toHaveValue("B15");
  await dialog.getByRole("button", { name: "Apply image" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("counts")).toHaveText("1,750 beads · 2 colors");
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  await page.getByRole("img", { name: "Pattern canvas" }).focus();
  await page.getByRole("img", { name: "Pattern canvas" }).press("Enter");
  await expect(page.getByTestId("counts")).toHaveText("1,749 beads · 2 colors");
  const expected = Array.from({ length: 50 }, () =>
    Array.from({ length: 50 }, (_, x) => (x < 20 ? "H7" : x < 35 ? "B15" : null)),
  );
  expected[0][0] = null;
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(expected);
  pixelsMatch(await download(page, "pixel"), expected);
  await expect(page.getByLabel("Draft status")).toContainText("saved on this device");
  await page.reload();
  await expect(page.getByLabel("Draft status")).toContainText("Recovered your saved draft");
  await expect(page.getByLabel("Pattern title")).toHaveValue("Pixel design");
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(expected);
});

test("automatically refreshes settings while retaining valid previews and manual color choices", async ({
  page,
}) => {
  const source = new PNG({ width: 2, height: 1 });
  source.data.set([0, 0, 0, 255, 255, 255, 255, 255]);
  await page.goto("/");
  await page
    .getByLabel("Open image", { exact: true })
    .setInputFiles({
      name: "Automatic.png",
      mimeType: "image/png",
      buffer: PNG.sync.write(source),
    });
  const dialog = page.getByRole("dialog");
  await selectChoice(dialog.getByRole("combobox", { name: "Image processing" }), "pixel");
  await dialog.getByLabel("Lock aspect ratio").uncheck();
  const apply = dialog.getByRole("button", { name: "Apply image" });
  const preview = dialog.getByRole("img", { name: "MARD preview" });
  await expect(preview).toBeVisible();
  await dialog.getByLabel("Target columns").fill("4");
  await dialog.getByLabel("Target rows").fill("1");
  await expect(
    dialog.getByText("MARD 221 · 2 colors · 4 × 1 cells · 4 beads", { exact: true }),
  ).toBeVisible();
  const black = dialog.getByLabel("Map #000000", { exact: true });
  const white = dialog.getByLabel("Map #FFFFFF", { exact: true });
  await black.fill("B15");
  await white.fill("B15");
  await expect(apply).toBeEnabled();
  const beforeConflict = await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await dialog.getByLabel("Distinct assignments").check();
  await expect(dialog.getByRole("alert")).toContainText("cannot reuse");
  await expect(apply).toBeDisabled();
  await expect(black).toHaveValue("B15");
  await expect(white).toHaveValue("B15");
  expect(await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(
    beforeConflict,
  );
  await dialog.getByLabel("Target columns").fill("6");
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await expect(dialog.getByRole("alert")).toContainText("cannot reuse");
  await expect(
    dialog.getByText("MARD 221 · 1 color · 4 × 1 cells · 4 beads", { exact: true }),
  ).toBeVisible();
  await white.fill("G14");
  await expect(
    dialog.getByText("MARD 221 · 2 colors · 6 × 1 cells · 6 beads", { exact: true }),
  ).toBeVisible();
  const valid = await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await dialog.getByLabel("Alpha threshold").fill("");
  await expect(dialog.getByRole("alert")).toContainText("Alpha threshold");
  await expect(apply).toBeDisabled();
  expect(await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(valid);
  await dialog.getByLabel("Alpha threshold").fill("128");
  await dialog.getByLabel("Target columns").fill("8");
  await dialog.getByLabel("Target columns").fill("10");
  await expect(
    dialog.getByText("MARD 221 · 2 colors · 10 × 1 cells · 10 beads", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Target columns")).toBeFocused();
  await expect(black).toHaveValue("B15");
  await expect(white).toHaveValue("G14");
  await apply.click();
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual([
    ["B15", "B15", "B15", "B15", "B15", "G14", "G14", "G14", "G14", "G14"],
  ]);
});

test("keeps manual color input focused when resampling changes source color counts", async ({
  page,
}) => {
  const source = new PNG({ width: 5, height: 1 });
  source.data.set([
    255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255,
  ]);
  await page.goto("/");
  await page
    .getByLabel("Open image", { exact: true })
    .setInputFiles({ name: "Focus.png", mimeType: "image/png", buffer: PNG.sync.write(source) });
  const dialog = page.getByRole("dialog");
  await selectChoice(dialog.getByRole("combobox", { name: "Image processing" }), "pixel");
  await dialog.getByLabel("Lock aspect ratio").uncheck();
  const black = dialog.getByLabel("Map #000000", { exact: true });
  await expect(black).toBeVisible();
  // Queue both native field edits and focus before the debounce can finish.
  await black.evaluate((field) => {
    const form = field.closest("dialog")!.querySelector("form")!;
    for (const [name, value] of [
      ["columns", "3"],
      ["rows", "1"],
    ]) {
      const input = form.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    field.focus();
  });
  await page.keyboard.type("B15");
  await expect(black).toHaveValue("B15");
  await expect(black).toBeFocused();
  await expect(
    dialog.getByText("MARD 221 · 2 colors · 3 × 1 cells · 3 beads", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Apply image" }).click();
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual([["H2", "B15", "H2"]]);
});

test("cancel and invalid PNG preserve the active document; WebP applies through the same dialog", async ({
  page,
}) => {
  await page.goto("/");
  await csv(page, 'H5,""\n"",H7');
  const before = [
    ["H5", null],
    [null, "H7"],
  ];
  await startNew(page);
  await page
    .getByLabel("Open image", { exact: true })
    .setInputFiles({ name: "preview.png", mimeType: "image/png", buffer: enlargedImage() });
  await expect(page.getByRole("img", { name: "MARD preview" })).toBeVisible();
  await page.getByRole("dialog").press("Escape");
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(before);
  await startNew(page);
  await page
    .getByLabel("Open image", { exact: true })
    .setInputFiles({
      name: "invalid.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image"),
    });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("could not be decoded");
  await page.getByRole("dialog").getByLabel("Target columns").fill("3");
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("could not be decoded");
  await expect(page.getByRole("dialog").getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Apply image" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(before);
  await startNew(page);
  await page
    .getByLabel("Open image", { exact: true })
    .setInputFiles({ name: "Sample.webp", mimeType: "image/webp", buffer: sampleWebp });
  await expect(
    page.getByRole("dialog").getByText("Sampled source · 198 × 300 pixels", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apply image" }).click();
  await expect(page.getByLabel("Pattern title")).toHaveValue("Sample");
  const grid = parsePatternCsv((await download(page, "csv")).toString());
  expect([grid[0].length, grid.length]).toEqual([33, 50]);
  expect(grid.flat().filter(Boolean).length).toBeGreaterThan(0);
});

test("invalid settings preserve work and mappings honor distinct choices", async ({ page }) => {
  await page.goto("/");
  await csv(page, "H7");
  await startNew(page);
  await page
    .getByLabel("Open image", { exact: true })
    .setInputFiles({ name: "colors.png", mimeType: "image/png", buffer: enlargedImage() });
  const dialog = page.getByRole("dialog");
  await selectChoice(dialog.getByRole("combobox", { name: "Image processing" }), "pixel");
  await dialog.getByLabel("Lock aspect ratio").uncheck();
  await expect(dialog.getByRole("img", { name: "MARD preview" })).toBeVisible();
  await dialog.getByLabel("Target columns").fill("0");
  await expect(dialog.getByRole("alert")).toContainText("dimensions");
  await expect(dialog.getByRole("button", { name: "Apply image" })).toBeDisabled();
  await dialog.getByLabel("Target columns").fill("50");
  await expect(dialog.getByRole("button", { name: "Apply image" })).toBeEnabled();
  await dialog.getByLabel("Distinct assignments").check();
  await dialog.getByLabel("Preserve chroma").uncheck();
  await expect(dialog.getByLabel("Map #000000")).toHaveAttribute("placeholder", "Auto · H7");
  await expect(dialog.getByLabel("Map #FFFFFF")).toHaveAttribute("placeholder", "Auto · H2");
  await dialog.getByLabel("Map #000000").fill("H2");
  await dialog.getByLabel("Map #000000").press("Tab");
  await expect(dialog.getByLabel("Map #FFFFFF")).not.toHaveAttribute("placeholder", "Auto · H2");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual([["H7"]]);
});

test("invalid mappings block Apply across edits to other rows until corrected", async ({
  page,
}) => {
  await page.goto("/");
  await csv(page, "H7,H2");
  await startNew(page);
  await page
    .getByLabel("Open image", { exact: true })
    .setInputFiles({ name: "colors.png", mimeType: "image/png", buffer: enlargedImage() });
  const dialog = page.getByRole("dialog");
  await selectChoice(dialog.getByRole("combobox", { name: "Image processing" }), "pixel");
  await dialog.getByLabel("Lock aspect ratio").uncheck();
  await expect(dialog.getByRole("img", { name: "MARD preview" })).toBeVisible();
  await dialog.getByLabel("Target columns").fill("50");
  await dialog.getByLabel("Target rows").fill("1");
  const black = dialog.getByLabel("Map #000000", { exact: true });
  const white = dialog.getByLabel("Map #FFFFFF", { exact: true });
  await black.fill("BAD");
  await black.press("Tab");
  await expect(dialog.getByRole("alert")).toContainText("Overrides");
  await white.fill("H5");
  await white.press("Tab");
  await expect(black).toHaveValue("BAD");
  await expect(white).toHaveValue("H5");
  await expect(dialog.getByRole("alert")).toContainText("Overrides");
  await expect(dialog.getByRole("button", { name: "Apply image" })).toBeDisabled();
  await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
  await black.fill("");
  await black.press("Tab");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(white).toHaveValue("H5");
  await dialog.getByRole("button", { name: "Apply image" }).click();
  const expected = [Array.from({ length: 50 }, (_, x) => (x < 20 ? "H7" : x < 35 ? "H5" : null))];
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(expected);
});

test("image dialog isolates undo and redo from the pattern and saved draft", async ({ page }) => {
  await page.goto("/");
  await csv(page, 'H5,"",""');
  const canvas = page.getByRole("img", { name: "Pattern canvas" });
  await canvas.focus();
  await canvas.press("ArrowRight");
  await canvas.press("Enter");
  await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
  await canvas.press("ArrowRight");
  await canvas.press("Enter");
  await expect(page.getByTestId("counts")).toHaveText("3 beads · 2 colors");
  await canvas.press("Control+z");
  await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
  const before = [["H5", "H7", null]];
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("my-beads.draft")!).grid))
    .toEqual(before);
  const saved = await page.evaluate(() => localStorage.getItem("my-beads.draft"));
  const file = { name: "Preview.png", mimeType: "image/png", buffer: enlargedImage() };
  await startNew(page);
  await page.getByLabel("Open image", { exact: true }).setInputFiles(file);
  const dialog = page.getByRole("dialog");
  await selectChoice(dialog.getByRole("combobox", { name: "Image processing" }), "pixel");
  await dialog.getByLabel("Lock aspect ratio").uncheck();
  await expect(dialog.getByRole("img", { name: "MARD preview" })).toBeVisible();
  for (const key of ["Control+z", "Control+Shift+z", "Meta+z", "Meta+Shift+z"]) {
    await dialog.getByLabel("Distinct assignments").press(key);
    await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
    expect(await page.evaluate(() => localStorage.getItem("my-beads.draft"))).toBe(saved);
  }
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(before);
  await canvas.focus();
  await canvas.press("Control+z");
  await expect(page.getByTestId("counts")).toHaveText("1 bead · 1 color");
  await canvas.press("Control+Shift+z");
  await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
  await startNew(page);
  await page.getByLabel("Open image", { exact: true }).setInputFiles(file);
  await expect(dialog.getByRole("img", { name: "MARD preview" })).toBeVisible();
  await selectChoice(dialog.getByRole("combobox", { name: "Image processing" }), "pixel");
  await dialog.getByLabel("Distinct assignments").press("Control+z");
  await dialog.getByRole("button", { name: "Apply image" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Pattern title")).toHaveValue("Preview");
});

test("corrupt drafts survive edits until explicit replacement", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("my-beads.draft", '{"version":99}'));
  await page.reload();
  await expect(page.getByLabel("Draft status")).toContainText("unsupported version");
  await csv(page, "H5");
  expect(await page.evaluate(() => localStorage.getItem("my-beads.draft"))).toBe('{"version":99}');
  await page.getByRole("button", { name: "Replace saved draft" }).click();
  await expect(page.getByLabel("Draft status")).toContainText("saved on this device");
  await page.reload();
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual([["H5"]]);
});

test("reload during a captured stroke recovers only the previously committed grid", async ({
  page,
}) => {
  await page.goto("/");
  await csv(page, 'H5,""');
  await expect(page.getByLabel("Draft status")).toContainText("saved on this device");
  const { cell } = await fitCoordinates(page, 2, 1);
  await page.mouse.move(cell(1, 0).x, cell(1, 0).y);
  await page.mouse.down();
  await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
  await page.reload();
  await page.mouse.up();
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual([["H5", null]]);
});

import { test, expect, type Page, type Download } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { createPattern, defaultPalette, parsePatternCsv, type PatternGrid } from "@my-beads/core";
import { openExport, closeExport, startNew, fitCoordinates, openPalette } from "./helpers.js";

const shermaPath = fileURLToPath(new URL("../../../templates/hollow-knight/sherma-singing-50x50.csv", import.meta.url));
async function bytes(download: Download) { return readFile((await download.path())!); }
async function download(page: Page, format: string, scale = 1) {
  await openExport(page);
  await page.getByLabel("Export format").selectOption(format);
  if (format === "pixel") await page.getByLabel("Pixel scale").fill(String(scale));
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const result = await bytes(await pending);
  await closeExport(page);
  return result;
}
function verifyPixels(buffer: Buffer, grid: PatternGrid, scale: number) {
  const png = PNG.sync.read(buffer);
  expect([png.width, png.height]).toEqual([grid[0].length * scale, grid.length * scale]);
  let mismatch = 0;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const code = grid[Math.floor(y / scale)][Math.floor(x / scale)];
    const offset = (y * png.width + x) * 4;
    if (!code) { if (png.data[offset + 3] !== 0) mismatch++; }
    else {
      const hex = defaultPalette.colors[code];
      if ([1, 3, 5].some((i, channel) => png.data[offset + channel] !== parseInt(hex.slice(i, i + 2), 16)) || png.data[offset + 3] !== 255) mismatch++;
    }
  }
  expect(mismatch).toBe(0);
}

for (const width of [1440, 390]) {
  test(`palette recommendations can be compared, chosen by keyboard and exported at ${width}px`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.getByLabel("Open CSV").setInputFiles({ name: "blank.csv", mimeType: "text/csv", buffer: Buffer.from('\"\",\"\"') });
    await expect(page.getByLabel("Pattern title")).toHaveValue("blank");
    await openPalette(page);
    const search = page.getByLabel("Search colors");
    await search.fill(" #4c4c40 ");
    await expect(page.locator(".search-source")).toContainText("#4C4C40");
    await expect(page.locator(".color-recommendation")).toHaveCount(2);
    await expect(page.locator(".selected-color strong")).toHaveText("H7");
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
    const closest = page.getByRole("button", { name: "H5 #474747", exact: true });
    const chroma = page.getByRole("button", { name: "B23 #303921", exact: true });
    await expect(closest).toHaveAccessibleDescription(/Closest color.*including grays/);
    await expect(chroma).toHaveAccessibleDescription(/Preserve chroma.*when the input has a tint/);
    for (const candidate of [closest, chroma]) {
      await expect(candidate).toBeVisible();
      const box = (await candidate.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await candidate.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    // macOS WebKit follows Safari's default Option-Tab navigation for buttons.
    const nextControl = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
    await search.press(nextControl);
    await expect(closest).toBeFocused();
    await page.keyboard.press(nextControl);
    await expect(chroma).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(chroma).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".selected-color strong")).toHaveText("B23");
    await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
    await page.getByRole("img", { name: "Pattern canvas" }).press("Enter");
    await expect(page.getByTestId("counts")).toHaveText("1 bead · 1 color");
    expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual([["B23", null]]);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
    await search.fill("#ff0000");
    await expect(page.locator(".color-recommendation")).toHaveCount(1);
    await expect(page.locator(".color-recommendation")).toHaveAccessibleDescription(/Closest color.*Preserve chroma/);
    await expect(page.locator(".selected-color strong")).toHaveText("B23");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.getByTestId("counts")).toHaveText("1 bead · 1 color");
    expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual([["B23", null]]);
    await search.fill("#000");
    await expect(page.locator(".color-recommendation")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "H7 #000000", exact: true })).toBeVisible();
    await expect(page.locator(".palette-results")).toContainText("Exact match");
  });
}

test("Sherma: all tools, grouped undo, CSV round trip and exact PNG/chart downloads", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Open CSV").setInputFiles(shermaPath);
  await expect(page.getByTestId("counts")).toHaveText("1,270 beads · 9 colors");
  const grid = parsePatternCsv(await readFile(shermaPath, "utf8")).map(row => [...row]);
  const { cell } = await fitCoordinates(page, 50, 50);
  const canvas = await page.getByRole("img", { name: "Pattern canvas" }).elementHandle();
  await openPalette(page);
  await page.getByLabel("Search colors").fill("H7");
  await page.getByRole("button", { name: "H7 #000000", exact: true }).click();
  const start = cell(0, 0), end = cell(4, 0);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y); await page.mouse.up();
  await expect(page.getByTestId("counts")).toHaveText("1,275 beads · 9 colors");
  for (let x = 0; x <= 4; x++) grid[0][x] = "H7";
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("counts")).toHaveText("1,270 beads · 9 colors");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByTestId("counts")).toHaveText("1,275 beads · 9 colors");
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  await page.mouse.click(cell(2, 0).x, cell(2, 0).y); grid[0][2] = null;
  await expect(page.getByTestId("counts")).toHaveText("1,274 beads · 9 colors");
  await page.getByLabel("Search colors").fill("H2");
  await page.getByRole("button", { name: "H2 #FFFFFF", exact: true }).click();
  await page.getByRole("button", { name: "Paint bucket" }).click();
  await page.mouse.click(start.x, start.y); grid[0][0] = "H2"; grid[0][1] = "H2";
  await page.getByRole("button", { name: "Eyedropper" }).click();
  await page.mouse.click(cell(4, 0).x, cell(4, 0).y);
  await expect(page.locator(".selected-color strong")).toHaveText("H7");
  await page.getByRole("button", { name: "Codes", exact: true }).click();
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  expect(await canvas!.evaluate(node => node === document.querySelector("canvas"))).toBe(true);
  await page.getByLabel("Pattern title").fill("Sherma study");
  const csv = await download(page, "csv");
  expect(parsePatternCsv(csv.toString())).toEqual(grid);
  await startNew(page);
  await page.getByLabel("Open CSV").setInputFiles({ name: "roundtrip.csv", mimeType: "text/csv", buffer: csv });
  await expect(page.getByLabel("Pattern title")).toHaveValue("roundtrip");
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(grid);
  verifyPixels(await download(page, "pixel", 1), grid, 1);
  verifyPixels(await download(page, "pixel", 3), grid, 3);
  await page.getByLabel("Pattern title").fill("Sherma & friends");
  const svg = (await download(page, "svg")).toString();
  expect(svg).toContain("Sherma &amp; friends"); expect(svg).toContain("MARD 221");
  expect(svg).toContain("50 × 50 grid · 9 colors · 1274 beads");
  for (const [code, count] of createPattern(grid).counts) {
    expect(svg).toContain(`>${code}</text>`); expect(svg).toContain(`>${count} beads</text>`);
  }
  const chart = PNG.sync.read(await download(page, "chart"));
  expect(chart.width).toBe(2400); expect(chart.height).toBe(Number(svg.match(/height="(\d+)"/)![1]));
  const sample = (192 + 5) * chart.width + 125 + 5;
  expect([...chart.data.subarray(sample * 4, sample * 4 + 4)]).toEqual([255, 255, 255, 255]);
  expect(errors).toEqual([]);
});

test("zoom and pan preserve cell targeting; invalid imports and exports preserve work", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Columns", { exact: true }).fill("4"); await page.getByLabel("Rows", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  const { center, zoom } = await fitCoordinates(page, 4, 4);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Pan", exact: true }).click();
  await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.mouse.move(center.x + 60, center.y + 20); await page.mouse.up();
  await page.getByRole("button", { name: "Pencil", exact: true }).click();
  await page.mouse.click(center.x + 60 + zoom * 1.25 * .5, center.y + 20 + zoom * 1.25 * .5);
  await expect(page.getByTestId("counts")).toHaveText("1 bead · 1 color");
  const grid = parsePatternCsv((await download(page, "csv")).toString());
  expect(grid[2][2]).toBe("H7"); expect(grid.flat().filter(Boolean)).toHaveLength(1);
  await startNew(page);
  await page.getByLabel("Open CSV").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("H7\nH7,H7") });
  await expect(page.getByRole("alert")).toContainText("row");
  expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(grid);
  await startNew(page);
  await page.getByLabel("Open CSV").setInputFiles(shermaPath);
  await expect(page.getByTestId("counts")).toHaveText("1,270 beads · 9 colors");
  await openExport(page);
  await page.getByLabel("Export format").selectOption("svg");
  await page.getByLabel("Chart width").fill("800");
  await page.getByRole("button", { name: "Download" }).click();
  await expect(page.getByRole("alert")).toContainText("at least 1250");
});

test("keyboard canvas editing and interrupted pointer strokes", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: "Create blank grid" }).click();
  const { cell } = await fitCoordinates(page, 50, 50);
  await page.mouse.move(cell(0, 0).x, cell(0, 0).y); await page.mouse.down();
  await page.getByRole("img", { name: "Pattern canvas" }).press("Escape"); await page.mouse.up();
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
  await page.getByRole("img", { name: "Pattern canvas" }).press("ArrowRight");
  await page.getByRole("img", { name: "Pattern canvas" }).press("Enter");
  await expect(page.getByTestId("counts")).toHaveText("1 bead · 1 color");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
});

test("fast drags paint to the boundary and remain one undo step", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Open CSV").setInputFiles({ name: "blank.csv", mimeType: "text/csv", buffer: Buffer.from('\"\",\"\",\"\",\"\"') });
  await expect(page.getByLabel("Pattern title")).toHaveValue("blank");
  const { cell } = await fitCoordinates(page, 4, 1);
  await page.getByRole("button", { name: "Pencil", exact: true }).click();
  await page.mouse.move(cell(0, 0).x, cell(0, 0).y); await page.mouse.down();
  await page.mouse.move(cell(8, 0).x, cell(8, 0).y); await page.mouse.up();
  await expect(page.getByTestId("counts")).toHaveText("4 beads · 1 color");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
});

for (const tool of ["Pencil", "Eraser"] as const) {
  test(`${tool} commits when capture is lost at release before pointerup`, async ({ page }) => {
    await page.goto("/");
    const original: PatternGrid = [["H2", "H2", "H2", "H2"]];
    const edited: PatternGrid = [[...Array<string | null>(3).fill(tool === "Pencil" ? "H7" : null), "H2"]];
    await page.getByLabel("Open CSV").setInputFiles({ name: "release.csv", mimeType: "text/csv", buffer: Buffer.from("H2,H2,H2,H2") });
    await expect(page.getByLabel("Pattern title")).toHaveValue("release");
    const { cell } = await fitCoordinates(page, 4, 1);
    const canvas = page.getByRole("img", { name: "Pattern canvas" });
    await canvas.evaluate(element => element.addEventListener("pointerdown", event => {
      element.setAttribute("data-pointer-id", String((event as PointerEvent).pointerId));
    }, { once: true }));
    await page.getByRole("button", { name: tool, exact: true }).click();
    await page.mouse.move(cell(0, 0).x, cell(0, 0).y); await page.mouse.down();
    await page.mouse.move(cell(2, 0).x, cell(2, 0).y);
    await expect(page.getByTestId("counts")).toHaveText(tool === "Pencil" ? "4 beads · 2 colors" : "1 bead · 1 color");
    // Replay the event order observed in desktop Chrome: capture loss with no
    // pressed buttons precedes pointerup. Normal automated mouse.up skips it.
    await canvas.evaluate(element => element.dispatchEvent(new PointerEvent("lostpointercapture", {
      bubbles: true, pointerId: Number(element.getAttribute("data-pointer-id")), pointerType: "mouse", buttons: 0,
    })));
    await page.mouse.up();
    expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(edited);
    await page.getByRole("button", { name: "Undo" }).click();
    expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(original);
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
    await page.getByRole("button", { name: "Redo" }).click();
    expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(edited);
    await expect(page.getByLabel("Draft status")).toContainText("saved on this device");
    await page.reload();
    expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual(edited);
  });

  for (const type of ["lostpointercapture", "pointercancel"] as const) {
    test(`${tool} still cancels an interrupted stroke on ${type}`, async ({ page }) => {
      await page.goto("/");
      await page.getByLabel("Open CSV").setInputFiles({ name: "interrupt.csv", mimeType: "text/csv", buffer: Buffer.from("H2,H2,H2,H2") });
      await expect(page.getByLabel("Pattern title")).toHaveValue("interrupt");
      const { cell } = await fitCoordinates(page, 4, 1);
      const canvas = page.getByRole("img", { name: "Pattern canvas" });
      await canvas.evaluate(element => element.addEventListener("pointerdown", event => {
        element.setAttribute("data-pointer-id", String((event as PointerEvent).pointerId));
      }, { once: true }));
      await page.getByRole("button", { name: tool, exact: true }).click();
      await page.mouse.move(cell(0, 0).x, cell(0, 0).y); await page.mouse.down();
      await page.mouse.move(cell(2, 0).x, cell(2, 0).y);
      await expect(page.getByTestId("counts")).toHaveText(tool === "Pencil" ? "4 beads · 2 colors" : "1 bead · 1 color");
      // Capture loss while still pressed is an interruption. Explicit cancel
      // must roll back even when its event reports no buttons pressed.
      await canvas.evaluate((element, type) => element.dispatchEvent(new PointerEvent(type, {
        bubbles: true, pointerId: Number(element.getAttribute("data-pointer-id")), pointerType: "mouse",
        buttons: type === "lostpointercapture" ? 1 : 0,
      })), type);
      await page.mouse.up();
      expect(parsePatternCsv((await download(page, "csv")).toString())).toEqual([["H2", "H2", "H2", "H2"]]);
      await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
    });
  }
}

test("export validates only the settings used by the selected format", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Open CSV").setInputFiles({ name: "single.csv", mimeType: "text/csv", buffer: Buffer.from("H7") });
  await expect(page.getByLabel("Pattern title")).toHaveValue("single");
  await openExport(page);
  await page.getByLabel("Export format").selectOption("svg");
  await page.getByLabel("Chart width").fill("0");
  expect(parsePatternCsv((await download(page, "csv", 0)).toString())).toEqual([["H7"]]);
  verifyPixels(await download(page, "pixel", 1), [["H7"]], 1);
  await openExport(page);
  await page.getByLabel("Export format").selectOption("svg");
  await page.getByLabel("Chart width").fill("800");
  expect((await download(page, "svg", 0)).toString()).toContain("MARD 221");

  await openExport(page);
  await page.getByLabel("Export format").selectOption("pixel");
  await page.getByLabel("Pixel scale").fill("0");
  await page.getByRole("button", { name: "Download" }).click();
  await expect(page.getByRole("alert")).toContainText("Pixel scale must be an integer");
  await page.getByLabel("Export format").selectOption("svg");
  await page.getByLabel("Chart width").fill("0");
  await page.getByRole("button", { name: "Download" }).click();
  await expect(page.getByRole("alert")).toContainText("Chart width must be an integer");
  await expect(page.getByTestId("counts")).toHaveText("1 bead · 1 color");
});

test("window blur cancels the active stroke and allows the next gesture", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  const { cell } = await fitCoordinates(page, 50, 50);
  await page.mouse.move(cell(0, 0).x, cell(0, 0).y);
  await page.mouse.down();
  await page.mouse.move(cell(3, 0).x, cell(3, 0).y);
  await expect(page.getByTestId("counts")).toHaveText("4 beads · 1 color");
  // Deliver the browser lifecycle event without relying on OS window focus in CI.
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await page.mouse.click(cell(2, 1).x, cell(2, 1).y);
  expect(parsePatternCsv((await download(page, "csv")).toString())[1][2]).toBe("H7");
  await expect(page.getByTestId("counts")).toHaveText("1 bead · 1 color");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
});

test("drawing on a full-window canvas preserves the fixed page and cell targeting", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  const { cell } = await fitCoordinates(page, 50, 50);
  const canvas = page.getByRole("img", { name: "Pattern canvas" });
  await canvas.evaluate(element => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top + 180));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.mouse.click(cell(10, 35).x, cell(10, 35).y);
  await expect(canvas).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const grid = parsePatternCsv((await download(page, "csv")).toString());
  expect(grid[35][10]).toBe("H7");
  expect(grid.flat().filter(Boolean)).toHaveLength(1);
});

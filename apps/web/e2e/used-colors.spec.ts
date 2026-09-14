import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { parsePatternCsv } from "@my-beads/core";
import { fitCoordinates, openExport } from "./helpers.js";
import { unobscuredArea, type CanvasEdge } from "../src/canvas-viewport.js";

async function scene(page: Page, csv: string) {
  await page.goto("/");
  await page.locator(".language-picker select").selectOption("en-US");
  if (await page.getByRole("button", { name: "New pattern", exact: true }).isVisible())
    await page.getByRole("button", { name: "New pattern", exact: true }).click();
  await page
    .getByLabel("Open CSV")
    .setInputFiles({ name: "Colors.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByLabel("Pattern title")).toHaveValue("Colors");
  const grid = parsePatternCsv(csv),
    { cell, zoom, box } = await fitCoordinates(page, grid[0].length, grid.length);
  const canvas = page.locator(".pattern-canvas");
  const pixel = (x: number, y: number, dx = 0, dy = 0) =>
    canvas.evaluate(
      (node, point) => {
        const element = node as HTMLCanvasElement,
          rect = element.getBoundingClientRect();
        return [
          ...element
            .getContext("2d")!
            .getImageData(
              Math.floor((point.x * element.width) / rect.width),
              Math.floor((point.y * element.height) / rect.height),
              1,
              1,
            ).data,
        ];
      },
      { x: cell(x, y).x - box.x + dx, y: cell(x, y).y - box.y + dy },
    );
  return { canvas, cell, zoom, pixel, grid };
}

test("used counts, independent highlighting, zero-count undo and exports stay in sync", async ({
  page,
}) => {
  const { canvas, cell, pixel, grid } = await scene(page, "H7,H2,H10");
  await expect(page.getByRole("button", { name: "Used colors", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".used-color-pick strong")).toHaveText(["H2", "H7", "H10"]);
  const element = await canvas.elementHandle();
  await page.getByRole("button", { name: "H2 #FFFFFF", exact: true }).click();
  const beforeZoom = await page.getByLabel("Zoom level").textContent();
  await page.getByRole("button", { name: "Locate H7 on canvas" }).press("Enter");
  await expect(page.locator(".highlight-summary")).toHaveText("Highlighting H7 · 1 bead");
  await expect(page.locator(".selected-color strong")).toHaveText("H2");
  await expect(page.getByLabel("Zoom level")).toHaveText(beforeZoom!);
  await expect.poll(() => pixel(0, 0)).toEqual([0, 0, 0, 255]);
  await expect.poll(() => pixel(1, 0)).not.toEqual([255, 255, 255, 255]);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  for (const format of ["csv", "pixel", "svg"]) {
    await openExport(page);
    await page.getByLabel("Export format").selectOption(format);
    if (format === "pixel") await page.getByLabel("Pixel scale").fill("1");
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    const bytes = await readFile((await (await pending).path())!);
    if (format === "csv") expect(parsePatternCsv(bytes.toString())).toEqual(grid);
    if (format === "pixel")
      expect([...PNG.sync.read(bytes).data.subarray(0, 8)]).toEqual([
        0, 0, 0, 255, 255, 255, 255, 255,
      ]);
    if (format === "svg") {
      expect(bytes.toString()).toContain("3 colors · 3 beads");
      expect(bytes.toString()).not.toContain("Highlighting");
    }
    await page.getByRole("button", { name: "Back to editing", exact: true }).click();
  }
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  await page.mouse.click(cell(0, 0).x, cell(0, 0).y);
  await expect(page.locator(".highlight-summary")).toHaveText("Highlighting H7 · 0 beads");
  await expect(page.getByRole("button", { name: "Show all locations" })).toBeDisabled();
  await expect(page.locator(".used-color-pick strong")).toHaveText(["H2", "H10"]);
  await expect.poll(() => pixel(0, 0)).not.toEqual([0, 0, 0, 255]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".highlight-summary")).toHaveText("Highlighting H7 · 1 bead");
  await expect.poll(() => pixel(0, 0)).toEqual([0, 0, 0, 255]);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".highlight-summary")).toHaveText("Highlighting H7 · 0 beads");
  await page.getByRole("button", { name: "Clear highlight" }).click();
  await expect(page.locator(".highlight-status")).toHaveCount(0);
  await expect.poll(() => pixel(1, 0)).toEqual([255, 255, 255, 255]);
  expect(await canvas.evaluate((node, previous) => node === previous, element)).toBe(true);
  await element?.dispose();
  await page.reload();
  await expect(page.locator(".highlight-status")).toHaveCount(0);
  await expect(page.locator(".used-color-pick strong")).toHaveText(["H2", "H10"]);
});

for (const code of ["H7", "H2"]) {
  test(`${code} outlines disconnected regions and holes without internal cell edges`, async ({
    page,
  }) => {
    const { pixel, zoom } = await scene(
      page,
      `${code},${code},${code},,B23\n${code},B23,${code},,B23\n${code},${code},${code},,${code}`,
    );
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    const original = code === "H7" ? [0, 0, 0, 255] : [255, 255, 255, 255];
    await expect.poll(() => pixel(0, 0)).toEqual(original);
    const background = await pixel(1, 1);
    await page.getByRole("button", { name: `Locate ${code} on canvas` }).click();
    await expect.poll(() => pixel(0, 0)).toEqual(original);
    await expect.poll(() => pixel(4, 2)).toEqual(original);
    await expect.poll(() => pixel(1, 1)).not.toEqual(background);
    // Two adjoining target cells stay seamless. An exposed outer edge and a hole edge get a contrasting stroke.
    await expect.poll(() => pixel(0, 0, zoom / 2)).toEqual(original);
    await expect.poll(() => pixel(1, 0, 0, -zoom / 2 + 1)).not.toEqual(original);
    await expect.poll(() => pixel(1, 0, 0, zoom / 2 - 1)).not.toEqual(original);
    // Panning shifts the rendered locations immediately, without editing.
    await page.getByRole("button", { name: "Pan", exact: true }).click();
    await page.locator(".pattern-canvas").press("Shift+ArrowRight");
    await expect.poll(() => pixel(4, 2, -30)).toEqual(original);
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  });
}

test("location controls fit the target and remain usable in bilingual narrow and short windows", async ({
  page,
}) => {
  for (const [width, height] of [
    [390, 844],
    [320, 390],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const { canvas } = await scene(page, "H7,H2,H7");
    for (const locale of ["en-US", "zh-CN"]) {
      await page.locator(".language-picker select").selectOption(locale);
      const chinese = locale === "zh-CN";
      await page.locator(".palette-toggle").click();
      await expect(page.locator('.palette-view button[aria-pressed="true"]')).toBeFocused();
      await page
        .getByRole("button", { name: chinese ? "在画布中定位 H7" : "Locate H7 on canvas" })
        .click();
      await expect(page.locator(".palette-panel")).not.toBeVisible();
      const clear = page.getByRole("button", { name: chinese ? "取消高亮" : "Clear highlight" });
      await expect(clear).toBeFocused();
      await expect(page.locator(".highlight-summary")).toContainText(
        chinese ? "正在高亮 H7 · 2 颗" : "Highlighting H7 · 2 beads",
      );
      // A live highlight must not squeeze the reopened panel's locator controls out of reach.
      await page.locator(".palette-toggle").click();
      await page
        .getByRole("button", { name: chinese ? "在画布中定位 H2" : "Locate H2 on canvas" })
        .click();
      await expect(page.locator(".highlight-summary")).toContainText(
        chinese ? "正在高亮 H2 · 1 颗" : "Highlighting H2 · 1 bead",
      );
      await page.locator(".palette-toggle").click();
      await page
        .getByRole("button", { name: chinese ? "在画布中定位 H7" : "Locate H7 on canvas" })
        .click();
      await canvas.press("Shift+ArrowRight");
      await page
        .getByRole("button", { name: chinese ? "查看全部位置" : "Show all locations" })
        .click();
      const area = await page.locator(".highlight-status").evaluate((node) => {
        const r = node.getBoundingClientRect();
        return {
          inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
          scroll: [scrollX, scrollY],
        };
      });
      expect(area).toEqual({ inside: true, scroll: [0, 0] });
      const box = (await canvas.boundingBox())!;
      const panels = await page.locator("[data-canvas-panel]").evaluateAll((nodes) =>
        nodes.map((node) => {
          const { x, y, width, height } = node.getBoundingClientRect();
          return {
            x,
            y,
            width,
            height,
            edge: getComputedStyle(node).getPropertyValue("--canvas-edge").trim(),
          };
        }),
      );
      const visible = unobscuredArea(
        box,
        panels.map((panel) => ({ ...panel, edge: panel.edge as CanvasEdge })),
      );
      const zoom = Math.max(0.25, Math.min(32, (visible.width - 64) / 3, visible.height - 64));
      // Both disconnected endpoints must be centered in the available area after the explicit fit.
      await expect
        .poll(() =>
          canvas.evaluate(
            (node, area) => {
              const canvas = node as HTMLCanvasElement,
                rect = canvas.getBoundingClientRect();
              return [-1, 1].map((offset) => [
                ...canvas
                  .getContext("2d")!
                  .getImageData(
                    Math.floor(
                      ((area.x + area.width / 2 + offset * area.zoom) * canvas.width) / rect.width,
                    ),
                    Math.floor(((area.y + area.height / 2) * canvas.height) / rect.height),
                    1,
                    1,
                  ).data,
              ]);
            },
            { ...visible, zoom },
          ),
        )
        .toEqual([
          [0, 0, 0, 255],
          [0, 0, 0, 255],
        ]);
      await clear.click();
      await expect(page.locator(".highlight-status")).toHaveCount(0);
      await expect(canvas).toBeFocused();
    }
  }
});

test("blank used view and a maximum-size low-zoom grid keep location controls responsive", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  await page.getByRole("button", { name: "Used colors", exact: true }).click();
  await expect(page.locator(".used-colors")).toContainText("No beads yet");
  await page.getByRole("button", { name: "All colors", exact: true }).click();
  await expect(page.getByLabel("Search colors")).toBeFocused();
  const csv = Array.from({ length: 256 }, (_, y) =>
    Array.from({ length: 256 }, (_, x) => ((x + y) % 2 ? "H7" : "H2")).join(","),
  ).join("\n");
  await page.setViewportSize({ width: 1280, height: 720 });
  const { canvas } = await scene(page, csv);
  await expect(page.locator(".used-count")).toHaveText(["32,768 beads", "32,768 beads"]);
  await page.getByRole("button", { name: "Locate H2 on canvas" }).click();
  await expect(page.locator(".highlight-summary")).toHaveText("Highlighting H2 · 32,768 beads");
  await page.getByRole("button", { name: "Show all locations" }).click();
  await page.getByRole("button", { name: "Clear highlight" }).click();
  await expect(canvas).toBeFocused();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

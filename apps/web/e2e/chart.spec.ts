import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createPattern, defaultPalette, parsePatternCsv, renderChart } from "@my-beads/core";

test("printable geometry and controlled-font visual regression", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "One controlled renderer owns the visual baseline; both engines test real exports.");
  const font = await readFile(new URL("../node_modules/@fontsource/roboto-mono/files/roboto-mono-latin-400-normal.woff2", import.meta.url));
  const colors = ["H7", "H5", "M12", "G17", "H4", "G14", "M9", "H20", "H2"];
  const sample = createPattern(Array.from({ length: 4 }, (_, y) => Array.from({ length: 25 }, (_, x) => x % 4 === y ? colors[x % colors.length] : null)));
  const svg = renderChart(sample.pattern, sample.counts, "Nine-color study", 800);
  await page.setContent(`<style>@font-face { font-family: ChartTest; src: url(data:font/woff2;base64,${font.toString("base64")}) } body { margin:0 } svg { display:block } svg * { font-family:ChartTest !important; font-synthesis:none }</style>${svg}`);
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.locator("svg").evaluate(svg => {
    const view = (svg as SVGSVGElement).viewBox.baseVal;
    return [...svg.querySelectorAll("text")].filter(text => {
      const rect = text.getBBox(); return rect.x < 0 || rect.y < 0 || rect.x + rect.width > view.width || rect.y + rect.height > view.height;
    }).map(text => text.textContent);
  });
  expect(overflow).toEqual([]);
  await expect(page.locator("svg")).toHaveScreenshot("chart-narrow.png", { maxDiffPixelRatio: 0.01, threshold: 0.2 });
  const sherma = createPattern(parsePatternCsv(await readFile(new URL("../../../templates/hollow-knight/sherma-singing-50x50.csv", import.meta.url), "utf8")));
  expect(renderChart(sherma.pattern, sherma.counts, "Sherma", 2400)).toContain("1270 beads");
  const wide = createPattern([Array<string>(70).fill("H7")]);
  expect(() => renderChart(wide.pattern, wide.counts, "Wide", 800)).toThrow("at least 1650");
  expect(Object.keys(defaultPalette.colors)).toHaveLength(221);
});

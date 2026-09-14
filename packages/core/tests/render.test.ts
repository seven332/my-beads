import { expect, it } from "vitest";
import { createPattern, renderChart, renderPixelArtSvg } from "../src/index.js";

it("renders a blank core document for a future new canvas", () => {
  const { pattern, counts } = createPattern([[null]]);
  expect(renderPixelArtSvg(pattern, 1)).toContain('width="1" height="1"');
  expect(renderPixelArtSvg(pattern, 1)).not.toContain("<rect");
  const chart = renderChart(pattern, counts, "Untitled", 2400);
  expect(chart).toContain("1 × 1 grid · 0 colors · 0 beads");
  expect(chart).not.toMatch(/NaN|Infinity/);
});

it("rejects invalid pixel scales and oversized output before rendering", () => {
  const { pattern } = createPattern([["H7"]]);
  for (const scale of [0, -1, 1.5, 513, Infinity, NaN]) {
    expect(() => renderPixelArtSvg(pattern, scale)).toThrow("Scale must be");
  }
  const wide = createPattern([Array<string>(65).fill("H7")]);
  expect(() => renderPixelArtSvg(wide.pattern, 512)).toThrow("32768");
});

it("validates chart width when called without the CLI adapter", () => {
  const { pattern, counts } = createPattern([["H7"]]);
  for (const width of [0, -1, 799, 800.5, 10_001, NaN, Infinity]) {
    expect(() => renderChart(pattern, counts, "Test", width)).toThrow("Chart width must be");
  }
  for (const width of [800, 10_000]) {
    expect(renderChart(pattern, counts, "Test", width)).toContain(`width="${width}"`);
  }
});

it("keeps legend cards readable and diagnoses grids wider than the page", () => {
  const narrow = createPattern([["H7", "H5", "M12", "G17", "H4", "G14", "M9", "H20", "H2"]]);
  const svg = renderChart(narrow.pattern, narrow.counts, "Nine colors", 800);
  const cards = [
    ...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="14"/g),
  ];
  expect(cards).toHaveLength(9);
  expect(new Set(cards.map((match) => match[2])).size).toBe(5);
  for (const card of cards) {
    expect(Number(card[3])).toBeGreaterThanOrEqual(220);
    expect(Number(card[1]) + Number(card[3])).toBeLessThanOrEqual(800);
  }
  const wide = createPattern([Array<string>(70).fill("H7")]);
  expect(() => renderChart(wide.pattern, wide.counts, "Wide", 800)).toThrow("at least 1650");
  expect(renderChart(wide.pattern, wide.counts, "Wide", 1650)).toContain('x="125"');
});

it("reserves space for three-digit column coordinates", () => {
  const wide = createPattern([Array<string>(256).fill("H7")]);
  expect(() => renderChart(wide.pattern, wide.counts, "Wide", 5370)).toThrow("at least 6394");
  const svg = renderChart(wide.pattern, wide.counts, "Wide", 6394);
  expect(svg).toContain('width="6144" height="24"');
});

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

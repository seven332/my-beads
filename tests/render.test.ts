import { expect, it } from "vitest";
import { createPattern, renderChart, renderPixelArtSvg } from "../packages/core/src/index.js";

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

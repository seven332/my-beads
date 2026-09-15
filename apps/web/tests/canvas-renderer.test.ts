import { expect, it } from "vitest";
import { canvasSize } from "../src/canvas-renderer.js";

it("uses native density for typical desktop and mobile canvases", () => {
  expect(canvasSize(1280, 720, 1)).toEqual({ width: 1280, height: 720 });
  expect(canvasSize(390, 844, 3)).toEqual({ width: 1170, height: 2532 });
  expect(canvasSize(120.5, 100.25, 1.25)).toEqual({ width: 151, height: 125 });
  expect(canvasSize(0, 100, 3)).toEqual({ width: 1, height: 1 });
});

it("bounds both pixel storage and dimensions for oversized or extremely narrow surfaces", () => {
  for (const [width, height, dpr] of [
    [7680, 4320, 4],
    [5000, 5000, 3],
    [20000, 100, 2],
    [0.1, 20000, 3],
    [8192.5, 2048.5, 2],
  ]) {
    const size = canvasSize(width, height, dpr);
    expect(size.width * size.height).toBeLessThanOrEqual(16_777_216);
    for (const value of [size.width, size.height]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(8192);
    }
  }
});

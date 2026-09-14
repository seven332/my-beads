import { expect, it } from "vitest";
import { floodFill, paintLine, type PatternGrid } from "../src/index.js";

it("interpolates fast strokes in both directions without mutating input", () => {
  const grid: PatternGrid = Array.from({ length: 5 }, () => Array<string | null>(5).fill(null));
  const result = paintLine(grid, { x: 0, y: 0 }, { x: 4, y: 4 }, "H7");
  expect(result).toEqual(grid.map((row, y) => row.map((_, x) => (x === y ? "H7" : null))));
  expect(paintLine(grid, { x: 4, y: 4 }, { x: 0, y: 0 }, "H7")).toEqual(result);
  expect(grid.flat().every((cell) => cell === null)).toBe(true);
  expect(paintLine(result, { x: 0, y: 0 }, { x: 4, y: 4 }, "H7")).toBe(result);
  expect(paintLine(grid, { x: -5, y: 0 }, { x: -1, y: 4 }, "H7")).toBe(grid);
  expect(paintLine(grid, { x: NaN, y: 0 }, { x: 4, y: 4 }, "H7")).toBe(grid);
});

it("clips fast strokes at grid edges, including exit and re-entry", () => {
  const grid = [
    [null, null, null, null],
    [null, null, null, null],
  ];
  expect(paintLine(grid, { x: 0, y: 0 }, { x: 20, y: 0 }, "H7")).toEqual([
    ["H7", "H7", "H7", "H7"],
    [null, null, null, null],
  ]);
  expect(paintLine(grid, { x: -20, y: 1 }, { x: 20, y: 1 }, "H2")).toEqual([
    [null, null, null, null],
    ["H2", "H2", "H2", "H2"],
  ]);
});

it("fills only the four-connected region, including transparency and edges", () => {
  const grid = [
    [null, "H7", null],
    [null, "H7", "H7"],
    ["H7", null, null],
  ];
  const result = floodFill(grid, { x: 0, y: 0 }, "H2");
  expect(result).toEqual([
    ["H2", "H7", null],
    ["H2", "H7", "H7"],
    ["H7", null, null],
  ]);
  expect(result[2]).toBe(grid[2]);
  expect(floodFill(result, { x: 0, y: 0 }, "H2")).toBe(result);
  expect(floodFill(grid, { x: 3, y: 0 }, "H2")).toBe(grid);
  expect(floodFill([["H7", "H7"]], { x: 1, y: 0 }, null)).toEqual([[null, null]]);
});

it("handles a full 256-square fill without recursion", () => {
  const grid = Array.from({ length: 256 }, () => Array<null>(256).fill(null));
  expect(floodFill(grid, { x: 255, y: 255 }, "H7").flat().filter(Boolean)).toHaveLength(65536);
});

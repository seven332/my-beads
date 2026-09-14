import type { PatternGrid } from "@my-beads/core";
import type { ViewArea } from "./canvas-viewport.js";

/** Bounds in grid cells, including every disconnected occurrence. */
export function colorBounds(grid: PatternGrid, code: string): ViewArea | null {
  let left = grid[0].length,
    top = grid.length,
    right = -1,
    bottom = -1;
  for (let y = 0; y < grid.length; y++)
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] !== code) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

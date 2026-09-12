import type { PatternGrid } from "./pattern.js";

export interface Point { x: number; y: number }

function inside(grid: PatternGrid, point: Point): boolean {
  return Number.isInteger(point.x) && Number.isInteger(point.y) &&
    point.y >= 0 && point.y < grid.length && point.x >= 0 && point.x < grid[0].length;
}

/** Integer Bresenham line. Endpoints must be inside the canonical rectangular grid. */
export function paintLine(grid: PatternGrid, from: Point, to: Point, color: string | null): PatternGrid {
  if (!inside(grid, from) || !inside(grid, to)) return grid;
  const rows = grid.slice();
  const changed = new Set<number>();
  let { x, y } = from;
  const dx = Math.abs(to.x - x), dy = -Math.abs(to.y - y);
  const sx = x < to.x ? 1 : -1, sy = y < to.y ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    if (rows[y][x] !== color) {
      if (!changed.has(y)) { rows[y] = rows[y].slice(); changed.add(y); }
      (rows[y] as (string | null)[])[x] = color;
    }
    if (x === to.x && y === to.y) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
  return changed.size ? rows : grid;
}

/** Iterative four-connected fill; diagonal contacts remain separate regions. */
export function floodFill(grid: PatternGrid, start: Point, color: string | null): PatternGrid {
  if (!inside(grid, start) || grid[start.y][start.x] === color) return grid;
  const target = grid[start.y][start.x];
  const rows = grid.slice();
  const changed = new Set<number>();
  const stack = [start];
  while (stack.length) {
    const { x, y } = stack.pop()!;
    if (rows[y][x] !== target) continue;
    if (!changed.has(y)) { rows[y] = rows[y].slice(); changed.add(y); }
    (rows[y] as (string | null)[])[x] = color;
    if (x > 0) stack.push({ x: x - 1, y });
    if (x + 1 < rows[0].length) stack.push({ x: x + 1, y });
    if (y > 0) stack.push({ x, y: y - 1 });
    if (y + 1 < rows.length) stack.push({ x, y: y + 1 });
  }
  return rows;
}

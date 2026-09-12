import type { PatternGrid } from "./pattern.js";

export interface Point { x: number; y: number }

function inside(grid: PatternGrid, point: Point): boolean {
  return Number.isInteger(point.x) && Number.isInteger(point.y) &&
    point.y >= 0 && point.y < grid.length && point.x >= 0 && point.x < grid[0].length;
}

/** Clip to the grid before rasterizing, so captured pointers can leave and re-enter. */
function clipLine(from: Point, to: Point, width: number, height: number): [Point, Point] | null {
  if (![from.x, from.y, to.x, to.y].every(Number.isSafeInteger)) return null;
  const dx = to.x - from.x, dy = to.y - from.y;
  let first = 0, last = 1;
  for (const [p, q] of [[-dx, from.x], [dx, width - 1 - from.x], [-dy, from.y], [dy, height - 1 - from.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const ratio = q / p;
    if (p < 0) first = Math.max(first, ratio); else last = Math.min(last, ratio);
    if (first > last) return null;
  }
  const point = (t: number): Point => ({ x: Math.max(0, Math.min(width - 1, Math.round(from.x + t * dx))),
    y: Math.max(0, Math.min(height - 1, Math.round(from.y + t * dy))) });
  return [point(first), point(last)];
}

/** Integer Bresenham line over the visible part of a canonical rectangular grid. */
export function paintLine(grid: PatternGrid, from: Point, to: Point, color: string | null): PatternGrid {
  const clipped = clipLine(from, to, grid[0].length, grid.length);
  if (!clipped) return grid;
  [from, to] = clipped;
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

import { defaultPalette, type PatternGrid } from "@my-beads/core";

/** Unit pitch and illustrative proportions, not calibrated physical dimensions. */
export const beadShape = {
  radius: 0.46,
  hole: 0.19,
  height: 0.82,
  pegRadius: 0.1,
  pegHeight: 0.55,
};

export function pegPosition(column: number, row: number, width: number, height: number) {
  return { x: column - (width - 1) / 2, z: row - (height - 1) / 2 };
}

export function previewData(grid: PatternGrid) {
  const width = grid[0].length;
  const height = grid.length;
  const beads: { x: number; z: number; color: string }[] = [];
  grid.forEach((row, y) =>
    row.forEach((code, x) => {
      if (code !== null)
        beads.push({ ...pegPosition(x, y, width, height), color: defaultPalette.colors[code] });
    }),
  );
  return { width, height, beads };
}

/** Bound GPU work without deleting positions, including blank-board pegs. */
export function previewQuality(cells: number) {
  return { segments: cells > 16384 ? 8 : cells > 4096 ? 12 : 20 };
}

export function previewBuffer(width: number, height: number, dpr: number) {
  const ratio = Math.min(
    dpr || 1,
    2,
    Math.sqrt(2_000_000 / (width * height)),
    4096 / Math.max(width, height),
  );
  return {
    width: Math.max(1, Math.floor(width * ratio)),
    height: Math.max(1, Math.floor(height * ratio)),
  };
}

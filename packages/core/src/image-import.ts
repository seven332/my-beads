import { defaultPalette, type PaletteDocument } from "./palette.js";
import { matchColors, type MatchOptions } from "./color-match.js";
import type { PatternGrid } from "./pattern.js";

export interface RgbaImage { width: number; height: number; data: Uint8Array | Uint8ClampedArray }
export interface SamplingOptions { columns: number; rows: number; alpha: number }
export interface SampledImage { grid: PatternGrid; colors: readonly { hex: string; count: number }[] }
export interface ImageMapping { source: string; code: string; hex: string; count: number; overridden: boolean; neutralFallback: boolean }
export interface MappedImage { grid: PatternGrid; mappings: readonly ImageMapping[]; candidates: readonly (readonly [string, string])[] }

export function validateImageSize(width: number, height: number): void {
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 8192) || width * height > 16_000_000) {
    throw new Error("Images are limited to 8192 pixels per side and 16 million pixels.");
  }
}

/** Sample the source pixel at each target cell's center; never blend neighboring colors. */
export function sampleImage(image: RgbaImage, options: SamplingOptions): SampledImage {
  validateImageSize(image.width, image.height);
  if (image.data.length !== image.width * image.height * 4) throw new Error("Image RGBA data has an invalid length.");
  const { columns, rows, alpha } = options;
  if (![columns, rows].every(n => Number.isInteger(n) && n >= 1 && n <= 256)) {
    throw new Error("Target grid dimensions must be integers from 1 to 256.");
  }
  if (!Number.isInteger(alpha) || alpha < 0 || alpha > 255) throw new Error("Alpha threshold must be an integer from 0 to 255.");
  const counts = new Map<string, number>();
  const grid = Array.from({ length: rows }, (_, y) => Array.from({ length: columns }, (_, x) => {
    const sx = Math.floor((x + .5) * image.width / columns);
    const sy = Math.floor((y + .5) * image.height / rows);
    const offset = (sy * image.width + sx) * 4;
    if (image.data[offset + 3] === 0 || image.data[offset + 3] < alpha) return null;
    const hex = "#" + [0, 1, 2].map(i => image.data[offset + i].toString(16).padStart(2, "0")).join("").toUpperCase();
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
    if (counts.size > 256) throw new Error("The sampled image has more than 256 colors. Use pixel art or a smaller target grid.");
    return hex;
  }));
  const colors = [...counts].map(([hex, count]) => ({ hex, count })).sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));
  return { grid, colors };
}

/** Manual choices reserve candidates before solving automatic distinct assignments. */
export function mapImage(sample: SampledImage, options: MatchOptions = {},
  overrides: Readonly<Record<string, string>> = {}): MappedImage {
  const series = (options.series ?? []).map(s => s.trim().toUpperCase());
  if (series.some(s => !/^[A-Z]+$/.test(s))) throw new Error("Series must contain letter prefixes.");
  const candidates = Object.entries(defaultPalette.colors).filter(([code]) => !series.length || series.some(s => code.startsWith(s)));
  if (!candidates.length) throw new Error("No MARD colors match the selected series.");
  const palette = Object.fromEntries(candidates);
  const sources = new Set(sample.colors.map(color => color.hex));
  const reserved = new Set<string>();
  for (const [hex, code] of Object.entries(overrides)) {
    if (!sources.has(hex) || !Object.hasOwn(palette, code)) throw new Error("Overrides must use a source color and a MARD code in the selected series.");
    if (options.unique && reserved.has(code)) throw new Error("Distinct assignments cannot reuse an overridden MARD code.");
    reserved.add(code);
  }
  const pending = sample.colors.filter(color => !Object.hasOwn(overrides, color.hex));
  const available: PaletteDocument = { colors: Object.fromEntries(candidates.filter(([code]) => !options.unique || !reserved.has(code))) };
  if (options.unique && pending.length > Object.keys(available.colors).length) {
    throw new Error("Not enough MARD colors for distinct assignments. Allow shared codes or select more series.");
  }
  const matches = new Map((pending.length ? matchColors(pending.map(c => c.hex), available, options) : []).map(m => [m.input, m]));
  const mappings = sample.colors.map(({ hex: source, count }) => {
    const overridden = Object.hasOwn(overrides, source);
    const match = matches.get(source);
    const code = overridden ? overrides[source] : match!.code;
    return { source, count, code, hex: palette[code], overridden, neutralFallback: match?.neutralFallback ?? false };
  });
  const codes = new Map(mappings.map(m => [m.source, m.code]));
  return { grid: sample.grid.map(row => row.map(hex => hex === null ? null : codes.get(hex)!)), mappings, candidates };
}

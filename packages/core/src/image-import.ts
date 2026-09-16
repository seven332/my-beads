import { BeadError } from "./errors.js";
import { defaultPalette, type PaletteDocument } from "./palette.js";
import { matchColors, type MatchOptions } from "./color-match.js";
import { selectImagePalette } from "./image-palette.js";
import type { PatternGrid } from "./pattern.js";

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}
export interface SamplingOptions {
  columns: number;
  rows: number;
  alpha: number;
}
export interface SampledImage {
  grid: PatternGrid;
  colors: readonly { hex: string; count: number }[];
}
export interface ImageMapping {
  source: string;
  code: string;
  hex: string;
  count: number;
  overridden: boolean;
  neutralFallback: boolean;
}
export interface MappedImage {
  grid: PatternGrid;
  mappings: readonly ImageMapping[];
  candidates: readonly (readonly [string, string])[];
}

export function validateImageSize(width: number, height: number): void {
  if (
    ![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 8192) ||
    width * height > 16_000_000
  ) {
    throw new BeadError(
      "imageSize",
      "Images are limited to 8192 pixels per side and 16 million pixels.",
    );
  }
}

/** Sample cell centers for pixel art, or alpha-weighted areas for ordinary images. */
export function sampleImage(
  image: RgbaImage,
  options: SamplingOptions,
  mode: "pixel" | "image" = "pixel",
): SampledImage {
  validateImageSize(image.width, image.height);
  if (image.data.length !== image.width * image.height * 4)
    throw new BeadError("imageData", "Image RGBA data has an invalid length.");
  const { columns, rows, alpha } = options;
  if (![columns, rows].every((n) => Number.isInteger(n) && n >= 1 && n <= 256)) {
    throw new BeadError(
      "targetDimensions",
      "Target grid dimensions must be integers from 1 to 256.",
    );
  }
  if (!Number.isInteger(alpha) || alpha < 0 || alpha > 255)
    throw new BeadError("alpha", "Alpha threshold must be an integer from 0 to 255.");
  const counts = new Map<string, number>();
  const grid = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: columns }, (_, x) => {
      const sx = Math.floor(((x + 0.5) * image.width) / columns);
      const sy = Math.floor(((y + 0.5) * image.height) / rows);
      const offset = (sy * image.width + sx) * 4;
      const rgba =
        mode === "image"
          ? areaPixel(
              image,
              (x * image.width) / columns,
              (y * image.height) / rows,
              ((x + 1) * image.width) / columns,
              ((y + 1) * image.height) / rows,
            )
          : image.data.subarray(offset, offset + 4);
      // Area overlaps may round an exact threshold slightly down (for example 128 to 127.999…).
      if (rgba[3] === 0 || rgba[3] + 1e-9 < alpha) return null;
      const hex =
        "#" +
        [0, 1, 2]
          .map((i) => rgba[i].toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
      return hex;
    }),
  );
  const colors = [...counts]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));
  return { grid, colors };
}

const linearChannels = Array.from({ length: 256 }, (_, byte) => {
  const value = byte / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
});
function encodedChannel(value: number): number {
  return Math.round(
    Math.max(
      0,
      Math.min(1, value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055),
    ) * 255,
  );
}

/** Linear-light area sampling with premultiplied alpha; invisible RGB cannot tint an edge. */
function areaPixel(
  image: RgbaImage,
  left: number,
  top: number,
  right: number,
  bottom: number,
): number[] {
  const channels = [0, 0, 0];
  let opacity = 0;
  for (let y = Math.floor(top); y < Math.ceil(bottom); y++) {
    for (let x = Math.floor(left); x < Math.ceil(right); x++) {
      const weight =
        (Math.min(x + 1, right) - Math.max(x, left)) * (Math.min(y + 1, bottom) - Math.max(y, top));
      const offset =
        (Math.min(y, image.height - 1) * image.width + Math.min(x, image.width - 1)) * 4;
      const alpha = image.data[offset + 3] * weight;
      opacity += alpha;
      for (let c = 0; c < 3; c++) channels[c] += linearChannels[image.data[offset + c]] * alpha;
    }
  }
  return [
    ...channels.map((channel) => (opacity ? encodedChannel(channel / opacity) : 0)),
    opacity / ((right - left) * (bottom - top)),
  ];
}

/** Manual choices reserve candidates before solving automatic distinct assignments. */
export function mapImage(
  sample: SampledImage,
  options: MatchOptions & { maxColors?: number } = {},
  overrides: Readonly<Record<string, string>> = {},
): MappedImage {
  const series = (options.series ?? []).map((s) => s.trim().toUpperCase());
  if (series.some((s) => !/^[A-Z]+$/.test(s)))
    throw new BeadError("series", "Series must contain letter prefixes.");
  let candidates = Object.entries(defaultPalette.colors).filter(
    ([code]) => !series.length || series.some((s) => code.startsWith(s)),
  );
  if (!candidates.length)
    throw new BeadError("seriesEmpty", "No MARD colors match the selected series.");
  const maximum = options.maxColors ?? candidates.length;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 221)
    throw new BeadError("imageColors", "Maximum bead colors must be an integer from 1 to 221.");
  const palette = Object.fromEntries(candidates);
  const sources = new Set(sample.colors.map((color) => color.hex));
  const reserved = new Set<string>();
  for (const [hex, code] of Object.entries(overrides)) {
    if (!sources.has(hex) || !Object.hasOwn(palette, code))
      throw new BeadError(
        "overrides",
        "Overrides must use a source color and a MARD code in the selected series.",
      );
    if (options.unique && reserved.has(code))
      throw new BeadError(
        "overrideUnique",
        "Distinct assignments cannot reuse an overridden MARD code.",
      );
    reserved.add(code);
  }
  if (
    options.maxColors !== undefined &&
    (reserved.size > maximum || (options.unique && sources.size > maximum))
  )
    throw new BeadError(
      "colorBudget",
      "Increase the color limit or clear manual/distinct assignments.",
    );
  candidates = selectImagePalette(
    sample,
    maximum,
    [...reserved],
    !!options.includeNeutral,
    candidates,
  );
  const pending = sample.colors.filter((color) => !Object.hasOwn(overrides, color.hex));
  const available: PaletteDocument = {
    colors: Object.fromEntries(
      candidates.filter(([code]) => !options.unique || !reserved.has(code)),
    ),
  };
  if (options.unique && pending.length > Object.keys(available.colors).length) {
    throw new BeadError(
      "paletteSize",
      "Not enough MARD colors for distinct assignments. Allow shared codes or select more series.",
    );
  }
  const matches = new Map(
    (pending.length
      ? matchColors(
          pending.map((c) => c.hex),
          available,
          options,
        )
      : []
    ).map((m) => [m.input, m]),
  );
  const mappings = sample.colors.map(({ hex: source, count }) => {
    const overridden = Object.hasOwn(overrides, source);
    const match = matches.get(source);
    const code = overridden ? overrides[source] : match!.code;
    return {
      source,
      count,
      code,
      hex: palette[code],
      overridden,
      neutralFallback: match?.neutralFallback ?? false,
    };
  });
  const codes = new Map(mappings.map((m) => [m.source, m.code]));
  return {
    grid: sample.grid.map((row) => row.map((hex) => (hex === null ? null : codes.get(hex)!))),
    mappings,
    candidates,
  };
}

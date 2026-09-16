import { BeadError, type BeadErrorCode } from "./errors.js";
import {
  sampleImage,
  mapImage,
  type RgbaImage,
  type SamplingOptions,
  type SampledImage,
  type MappedImage,
} from "./image-import.js";
import type { MatchOptions } from "./color-match.js";

export interface ImageConversionOptions extends SamplingOptions, Omit<MatchOptions, "series"> {
  mode: "image" | "pixel";
  maxColors: number;
}
export interface ImageConversionResult {
  sample: SampledImage | null;
  mapped: MappedImage | null;
  overrides: Readonly<Record<string, string>>;
  error: {
    code: BeadErrorCode;
    message: string;
    values: Readonly<Record<string, string | number>>;
  } | null;
}

/** A serializable result retains sampled colors when a manual mapping needs correction. */
export function convertImage(
  image: RgbaImage,
  options: ImageConversionOptions,
  choices: Readonly<Record<string, string>> = {},
): ImageConversionResult {
  let sample: SampledImage | null = null;
  let overrides = choices;
  try {
    if (options.mode !== "image" && options.mode !== "pixel")
      throw new BeadError("imageMode", "Choose ordinary image or preserve pixels.");
    sample = sampleImage(image, options, options.mode);
    if (options.mode === "pixel") {
      const colors = new Set(sample.colors.map((color) => color.hex));
      overrides = Object.fromEntries(Object.entries(choices).filter(([hex]) => colors.has(hex)));
    }
    const mapped = mapImage(
      sample,
      { ...options, unique: options.mode === "pixel" && options.unique },
      options.mode === "pixel" ? overrides : {},
    );
    return { sample, mapped, overrides, error: null };
  } catch (error) {
    if (!(error instanceof BeadError)) throw error;
    return {
      sample,
      mapped: null,
      overrides,
      error: { code: error.code, message: error.message, values: error.values },
    };
  }
}

export function imageGridSize(width: number, height: number, longest = 50) {
  const scale = Math.min(1, longest / Math.max(width, height));
  return {
    columns: Math.max(1, Math.round(width * scale)),
    rows: Math.max(1, Math.round(height * scale)),
  };
}

/** Keep the edited axis; clamp the pair together when the source ratio reaches an axis limit. */
export function linkedImageSize(
  width: number,
  height: number,
  axis: "columns" | "rows",
  value: number,
) {
  if (!Number.isInteger(value) || value < 1 || value > 256) return { [axis]: value };
  const scale = Math.min(
    value / (axis === "columns" ? width : height),
    256 / Math.max(width, height),
  );
  return {
    columns: Math.max(1, Math.round(width * scale)),
    rows: Math.max(1, Math.round(height * scale)),
  };
}

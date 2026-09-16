import { expect, it } from "vitest";
import {
  convertImage,
  defaultPalette,
  imageGridSize,
  linkedImageSize,
  sampleImage,
  type ImageConversionOptions,
  type RgbaImage,
} from "../src/index.js";

const options: ImageConversionOptions = {
  mode: "image",
  columns: 32,
  rows: 16,
  alpha: 128,
  maxColors: 24,
};
const rich: RgbaImage = {
  width: 32,
  height: 16,
  data: Uint8Array.from(
    Array.from({ length: 512 }, (_, i) => [
      i % 256,
      Math.floor(i / 256) * 127,
      i % 137,
      255,
    ]).flat(),
  ),
};

it("converts more than 256 source colors deterministically within an actual MARD budget", () => {
  for (const maxColors of [1, 8, 24, 221]) {
    const result = convertImage(rich, { ...options, maxColors });
    expect(result.error).toBeNull();
    expect(result.sample!.colors.length).toBe(512);
    const grid = result.mapped!.grid;
    expect(grid).toHaveLength(16);
    expect(grid.flat()).toHaveLength(512);
    expect(new Set(grid.flat()).size).toBeLessThanOrEqual(maxColors);
    expect(grid.flat().every((code) => code && Object.hasOwn(defaultPalette.colors, code))).toBe(
      true,
    );
    expect(convertImage(rich, { ...options, maxColors }).mapped!.grid).toEqual(grid);
  }
});

it("preserves every exact palette color and transparent cells in pixel mode", () => {
  const codes = Object.keys(defaultPalette.colors);
  const source = {
    width: codes.length + 1,
    height: 1,
    data: Uint8Array.from([
      ...codes.flatMap((code) =>
        [1, 3, 5].map((i) => parseInt(defaultPalette.colors[code].slice(i, i + 2), 16)).concat(255),
      ),
      1,
      2,
      3,
      0,
    ]),
  };
  const result = convertImage(source, {
    ...options,
    mode: "pixel",
    columns: source.width,
    rows: 1,
    maxColors: 221,
  });
  expect(result.error).toBeNull();
  expect(result.mapped!.grid).toEqual([[...codes, null]]);
});

it("area samples in linear light without letting invisible RGB contaminate edges", () => {
  const threshold = {
    width: 13,
    height: 3,
    data: Uint8Array.from(Array.from({ length: 39 }, () => [0, 0, 0, 128]).flat()),
  };
  expect(sampleImage(threshold, { columns: 3, rows: 2, alpha: 128 }, "image").grid.flat()).toEqual(
    Array(6).fill("#000000"),
  );
  const source = { width: 2, height: 1, data: Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 0]) };
  expect(sampleImage(source, { columns: 1, rows: 1, alpha: 127 }, "image").grid).toEqual([
    ["#FF0000"],
  ]);
  expect(sampleImage(source, { columns: 1, rows: 1, alpha: 128 }, "image").grid).toEqual([[null]]);
  const opaque = { ...source, data: Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 255]) };
  expect(sampleImage(opaque, { columns: 1, rows: 1, alpha: 128 }, "image").grid).toEqual([
    ["#BCBCBC"],
  ]);
  expect(sampleImage(opaque, { columns: 1, rows: 1, alpha: 128 }, "pixel").grid).toEqual([
    ["#FFFFFF"],
  ]);
});

it("retains correctable mapping errors and ignores but preserves pixel choices in ordinary mode", () => {
  const source = { width: 2, height: 1, data: Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 255]) };
  const settings = { ...options, columns: 2, rows: 1, mode: "pixel" as const, maxColors: 1 };
  const result = convertImage(source, settings, { "#000000": "H7", "#FFFFFF": "H2" });
  expect(result.error?.code).toBe("colorBudget");
  expect(result.sample?.colors).toHaveLength(2);
  expect(result.overrides).toEqual({ "#000000": "H7", "#FFFFFF": "H2" });
  const invalid = { "#000000": "BAD" };
  expect(convertImage(source, settings, invalid).error?.code).toBe("overrides");
  const ordinary = convertImage(source, { ...settings, mode: "image" }, invalid);
  expect(ordinary.error).toBeNull();
  expect(ordinary.overrides).toEqual(invalid);
  expect(new Set(ordinary.mapped!.grid.flat()).size).toBe(1);
  expect(convertImage(rich, { ...options, mode: "pixel", unique: true }).error?.code).toBe(
    "colorBudget",
  );
  for (const maxColors of [0, 222, NaN, 1.5])
    expect(convertImage(source, { ...settings, maxColors }).error?.code).toBe("imageColors");
});

it("derives source proportions without upscaling and clamps linked dimensions together", () => {
  expect(imageGridSize(600, 400)).toEqual({ columns: 50, rows: 33 });
  expect(imageGridSize(2, 1)).toEqual({ columns: 2, rows: 1 });
  expect(linkedImageSize(600, 400, "columns", 30)).toEqual({ columns: 30, rows: 20 });
  expect(linkedImageSize(600, 400, "rows", 256)).toEqual({ columns: 256, rows: 171 });
  expect(linkedImageSize(600, 400, "rows", NaN)).toEqual({ rows: NaN });
});

it("spends the remaining palette budget on automatic colors instead of overridden source colors", () => {
  const pixels = Array.from({ length: 1024 }, (_, index) => {
    const hex =
      index < 1000
        ? "#000000"
        : index < 1010
          ? defaultPalette.colors.F13
          : index < 1020
            ? defaultPalette.colors.D22
            : "#333996";
    return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).concat(255);
  });
  const result = convertImage(
    { width: 64, height: 16, data: Uint8Array.from(pixels.flat()) },
    { ...options, columns: 64, rows: 16, mode: "pixel", maxColors: 3, includeNeutral: true },
    { "#000000": "H2" },
  );
  expect(result.error).toBeNull();
  const mapped = result.mapped!.grid.flat();
  expect(mapped.slice(0, 1000)).toEqual(Array(1000).fill("H2"));
  const fewerOverriddenPixels = convertImage(
    { width: 25, height: 1, data: Uint8Array.from([pixels[0], ...pixels.slice(1000)].flat()) },
    { ...options, columns: 25, rows: 1, mode: "pixel", maxColors: 3, includeNeutral: true },
    { "#000000": "H2" },
  );
  expect(fewerOverriddenPixels.error).toBeNull();
  expect(mapped.slice(1000)).toEqual(fewerOverriddenPixels.mapped!.grid[0].slice(1));
  expect(mapped.slice(1000)).not.toContain("H7");
  expect(new Set(mapped).size).toBe(3);
});

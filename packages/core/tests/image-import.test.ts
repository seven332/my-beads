import { expect, it } from "vitest";
import { sampleImage, mapImage, type RgbaImage } from "../src/index.js";

const image = (pixels: number[][], width = pixels.length): RgbaImage => ({
  width,
  height: pixels.length / width,
  data: new Uint8Array(pixels.flat()),
});
it("samples cell centers at unequal scales without blending", () => {
  const source = image(
    [
      [1, 2, 3, 255],
      [10, 20, 30, 255],
      [40, 50, 60, 255],
      [70, 80, 90, 255],
      [100, 110, 120, 255],
      [1, 2, 3, 255],
      [11, 21, 31, 255],
      [41, 51, 61, 255],
      [71, 81, 91, 255],
      [101, 111, 121, 255],
      [1, 2, 3, 255],
      [12, 22, 32, 255],
      [42, 52, 62, 255],
      [72, 82, 92, 255],
      [102, 112, 122, 255],
    ],
    5,
  );
  expect(sampleImage(source, { columns: 2, rows: 2, alpha: 128 }).grid).toEqual([
    ["#0A141E", "#46505A"],
    ["#0C1620", "#48525C"],
  ]);
  expect(
    sampleImage(
      image([
        [0, 0, 0, 255],
        [255, 255, 255, 255],
      ]),
      { columns: 4, rows: 1, alpha: 128 },
    ).grid,
  ).toEqual([["#000000", "#000000", "#FFFFFF", "#FFFFFF"]]);
});
it("preserves transparency and includes exactly the alpha threshold", () => {
  const source = image([0, 127, 128, 255].map((alpha) => [255, 0, 0, alpha]));
  expect(sampleImage(source, { columns: 4, rows: 1, alpha: 128 })).toEqual({
    grid: [[null, null, "#FF0000", "#FF0000"]],
    colors: [{ hex: "#FF0000", count: 2 }],
  });
  expect(sampleImage(source, { columns: 4, rows: 1, alpha: 0 }).grid).toEqual([
    [null, "#FF0000", "#FF0000", "#FF0000"],
  ]);
});
it("rejects invalid dimensions, buffers and thresholds but accepts color-rich samples", () => {
  const source = image([[0, 0, 0, 255]]);
  for (const columns of [0, 1.5, 257, NaN])
    expect(() => sampleImage(source, { columns, rows: 1, alpha: 128 })).toThrow("dimensions");
  for (const alpha of [-1, 0.5, 256, NaN])
    expect(() => sampleImage(source, { columns: 1, rows: 1, alpha })).toThrow("Alpha");
  expect(() => sampleImage({ ...source, width: 8193 }, { columns: 1, rows: 1, alpha: 1 })).toThrow(
    "limited",
  );
  expect(() =>
    sampleImage({ ...source, data: new Uint8Array(3) }, { columns: 1, rows: 1, alpha: 1 }),
  ).toThrow("length");
  const many = image(
    Array.from({ length: 512 }, (_, i) => [i % 256, Math.floor(i / 256), 0, 255]),
    256,
  );
  expect(sampleImage(many, { columns: 256, rows: 2, alpha: 1 }).colors).toHaveLength(512);
});
it("maps exact colors, permits shared codes by default and respects overrides", () => {
  const sample = sampleImage(
    image([
      [0, 0, 0, 255],
      [1, 1, 1, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 0],
    ]),
    { columns: 4, rows: 1, alpha: 128 },
  );
  expect(mapImage(sample).grid).toEqual([["H7", "H7", "H2", null]]);
  expect(mapImage(sample, {}, { "#010101": "H5" }).grid).toEqual([["H7", "H5", "H2", null]]);
  expect(() => mapImage(sample, {}, { "#010101": "BAD" })).toThrow("Overrides");
});
it("reserves manual choices and enforces series and distinct constraints", () => {
  const sample = sampleImage(
    image([
      [77, 77, 61, 255],
      [53, 53, 42, 255],
    ]),
    { columns: 2, rows: 1, alpha: 128 },
  );
  expect(mapImage(sample, { unique: true, series: ["B"] }).grid).toEqual([["B15", "B23"]]);
  const overridden = mapImage(sample, { unique: true, series: ["B"] }, { "#4D4D3D": "B23" });
  expect(overridden.grid[0][0]).toBe("B23");
  expect(overridden.grid[0][1]).not.toBe("B23");
  expect(() => mapImage(sample, { unique: true }, { "#4D4D3D": "B23", "#35352A": "B23" })).toThrow(
    "cannot reuse",
  );
  expect(() => mapImage(sample, { series: ["B"] }, { "#4D4D3D": "H7" })).toThrow("selected series");
  expect(() => mapImage(sample, { series: ["Z"] })).toThrow("No MARD");
  const colors = sampleImage(image(Array.from({ length: 40 }, (_, i) => [i, 0, 0, 255])), {
    columns: 40,
    rows: 1,
    alpha: 128,
  });
  expect(() => mapImage(colors, { unique: true, series: ["M"] })).toThrow("Not enough");
});

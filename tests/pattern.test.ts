import { describe, expect, it } from "vitest";
import {
  createPattern, defaultPalette, parseCsv, parsePatternCsv, serializePatternCsv,
  validatePalette, type PatternGrid,
} from "../packages/core/src/index.js";

describe("CSV documents", () => {
  it("normalizes BOM, whitespace, CRLF, hex values and transparent aliases", () => {
    expect(parsePatternCsv('\uFEFF" h7 ",#ffffff,ERASE\r\nTRANSPARENT,,"H7"\r\n'))
      .toEqual([["H7", "H2", null], [null, null, "H7"]]);
  });

  it("parses escaped quotes, commas and newlines within quoted fields", () => {
    expect(parseCsv('"a""b","c,d","e\nf"')).toEqual([['a"b', "c,d", "e\nf"]]);
    expect(parseCsv("H7\rH2\r")).toEqual([["H7"], ["H2"]]);
  });

  const grids: PatternGrid[] = [
    [[null]], [["H7"]], [[null, null], [null, null]],
    [["H7", null, "H2"], [null, "B23", null]],
  ];
  it.each(grids.map((grid) => ({ grid })))("round-trips $grid", ({ grid }) => {
    expect(parsePatternCsv(serializePatternCsv(grid))).toEqual(grid);
  });

  it("retains trailing empty rows and columns", () => {
    expect(parsePatternCsv("H7,\n,\n")).toEqual([["H7", null], [null, null]]);
    expect(parsePatternCsv('""')).toEqual([[null]]);
    expect(parsePatternCsv("\n")).toEqual([[null]]);
  });

  it.each(["", "H7,H2\nH7", 'H"7', '"H7"oops', '"H7'])("rejects malformed CSV %j", (csv) => {
    expect(() => parsePatternCsv(csv)).toThrow();
  });

  it("reports an unknown color with its location", () => {
    expect(() => parsePatternCsv("H7,\nH2,ZZ99")).toThrow("row 2, column 2");
    expect(() => parsePatternCsv("#123456")).toThrow("Unknown MARD color");
  });

  it("validates grids supplied without CSV and derives counts without changing inputs", () => {
    expect(() => createPattern([])).toThrow("at least one cell");
    expect(() => createPattern([[]])).toThrow("at least one cell");
    expect(() => createPattern([["H7"], []])).toThrow("expected 1");
    const grid = Object.freeze([Object.freeze(["H7", "H7", null])]);
    const result = createPattern(grid);
    expect([...result.counts]).toEqual([["H7", 2]]);
    expect(result.pattern[0][2].transparent).toBe(true);
    expect(result.grid).toEqual(grid);
    expect(createPattern([[null]]).counts.size).toBe(0);
  });
});

describe("palettes", () => {
  it("contains the original 221 MARD colors", () => {
    expect(Object.keys(defaultPalette.colors)).toHaveLength(221);
    expect(defaultPalette.colors).toMatchObject({ H7: "#000000", H2: "#FFFFFF", B23: "#303921" });
  });

  it("normalizes custom colors and codes", () => {
    const palette = validatePalette({ colors: { x1: "#abc", X2: "123456" } });
    expect(palette.colors).toEqual({ X1: "#AABBCC", X2: "#123456" });
    expect(parsePatternCsv("x1,#123456", palette)).toEqual([["X1", "X2"]]);
  });

  it("preserves custom names and escapes CSV punctuation when serializing them", () => {
    const palette = validatePalette({ colors: { black: "#000000", 'warm,"red"': "#FF0000" } });
    const grid = [["BLACK", 'WARM,"RED"', null]];
    expect(parsePatternCsv(serializePatternCsv(grid, palette), palette)).toEqual(grid);
  });

  it.each([null, [], {}, { colors: null }, { colors: [] }, { colors: {} },
    { colors: { H7: 5 } }, { colors: { H7: "#GGGGGG" } },
    { colors: { H7: "#000000", h7: "#FFFFFF" } }, { colors: { "": "#000000" } },
    { colors: { TRANSPARENT: "#000000" } }, { colors: { "#000000": "#FFFFFF" } },
  ])("rejects invalid external data %j", (palette) => {
    expect(() => validatePalette(palette)).toThrow();
  });
});

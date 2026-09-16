import { describe, expect, it } from "vitest";
import {
  createPattern,
  defaultPalette,
  parseCsv,
  parsePatternCsv,
  serializePatternCsv,
  validatePalette,
  type PatternGrid,
} from "../src/index.js";

describe("CSV documents", () => {
  it("normalizes BOM, whitespace, CRLF, hex values and transparent aliases", () => {
    expect(parsePatternCsv('\uFEFF" h7 ",#ffffff,ERASE\r\nTRANSPARENT,,"H7"\r\n')).toEqual([
      ["H7", "H2", null],
      [null, null, "H7"],
    ]);
  });

  it("parses escaped quotes, commas and newlines within quoted fields", () => {
    expect(parseCsv('"a""b","c,d","e\nf"')).toEqual([['a"b', "c,d", "e\nf"]]);
    expect(parseCsv("H7\rH2\r")).toEqual([["H7"], ["H2"]]);
  });

  it.each([",", ";", "\t"])("preserves empty borders and mixed cells with %j", (separator) => {
    const csv =
      [
        ["", "", ""],
        [" h7 ", '"fff"', "ERASE"],
        ["TRANSPARENT", "", ""],
      ]
        .map((row) => row.join(separator))
        .join("\r\n") + "\r\n";
    expect(parsePatternCsv(csv)).toEqual([
      [null, null, null],
      ["H7", "H2", null],
      [null, null, null],
    ]);
  });

  it.each([",", ";", "\t"])("honors a leading separator declaration for %j", (separator) => {
    expect(parsePatternCsv(`\uFEFFSeP=${separator}\r\nH7${separator}FFFFFF\r\n`)).toEqual([
      ["H7", "H2"],
    ]);
    expect(() => parsePatternCsv(`sep=${separator}\nH7${separator}H2\nH7`)).toThrow(
      "CSV row 3 has 1 columns; expected 2",
    );
    expect(() => parsePatternCsv(`sep=${separator}\nH7${separator}#nope`)).toThrow(
      "row 2, column 2",
    );
    expect(() => parsePatternCsv(`sep=${separator}\n`)).toThrow("does not contain a pattern grid");
  });

  it("keeps quoted delimiters inside fields and preserves tab padding of CSV", () => {
    expect(parseCsv('"a,b";"c;d";"e\tf"')).toEqual([["a,b", "c;d", "e\tf"]]);
    expect(parseCsv('"a,b"\t"c;d"\t"e""f"')).toEqual([["a,b", "c;d", 'e"f']]);
    expect(parsePatternCsv('\t"H7"\t,\tH2\t')).toEqual([["H7", "H2"]]);
    expect(parsePatternCsv('\t"H7"\t;\tH2\t')).toEqual([["H7", "H2"]]);
    expect(parsePatternCsv("\tH7\t\n\t\t\n")).toEqual([
      [null, "H7", null],
      [null, null, null],
    ]);
    expect(parsePatternCsv('sep=,\n\t"H7"\t')).toEqual([["H7"]]);
    expect(parseCsv('sep=;\n"a,b";"c"')).toEqual([["a,b", "c"]]);
  });

  it("resolves bare hex after exact codes, including code-shaped hex", () => {
    expect(parsePatternCsv("B17,F13,000,000000,fff,ffffff")).toEqual([
      ["B17", "F13", "H7", "H7", "H2", "H2"],
    ]);
    const palette = validatePalette({
      colors: { B17: "#000000", X: "#BB1177", FFF: "#123456", WHITE: "#FFFFFF" },
    });
    expect(parsePatternCsv("b17,#b17,fff,#fff", palette)).toEqual([["B17", "X", "FFF", "WHITE"]]);
  });

  it.each([
    "H7;H2\nH7",
    "H7\tH2\nH7",
    "H7,H2;H5",
    "H7;H2\tH5",
    "H7,H2\n\n",
    "name,color\nH7,H2",
    "sep=|\nH7|H2",
  ])("does not repair malformed grids %j", (csv) => {
    expect(() => parsePatternCsv(csv)).toThrow();
  });

  it.each([
    "#55514C",
    "55514C",
    "#GGG",
    "null",
    "none",
    "0",
    "#00000000",
    "#000000FF",
    "rgb(0,0,0)",
  ])("reports unsupported color %j with its location", (value) => {
    expect(() => parsePatternCsv(`H7;"${value}"`)).toThrow("row 1, column 2");
  });

  it("reports quote errors after separator declarations", () => {
    expect(() => parsePatternCsv('sep=;\nH7;"H2"oops')).toThrow("row 2, column 2");
    expect(() => parsePatternCsv('sep=;\nH7;"H2')).toThrow("row 2, column 2");
  });

  it("exports compact exact bytes while preserving single-column empty records", () => {
    expect(
      serializePatternCsv([
        [null, "H7", null],
        ["H2", null, "B17"],
        [null, null, null],
      ]),
    ).toBe(",H7,\nH2,,B17\n,,\n");
    expect(serializePatternCsv([[null], ["H7"], [null]])).toBe('\"\"\nH7\n\"\"\n');
    expect(serializePatternCsv([[null]])).toBe('\"\"\n');
    expect(serializePatternCsv([["h7", "#fff", "ERASE"]])).toBe("H7,H2,\n");
  });

  it.each([
    "TRANSPARENT,#000000,TRANSPARENT\n#FFFFFF,ERASE,#757D7B\nTRANSPARENT,TRANSPARENT,TRANSPARENT",
    '\"\",H7,\"\"\nH2,\"\",M15\n\"\",\"\",\"\"',
  ])("round-trips legacy hex and quoted-empty code grids %j", (source) => {
    const grid = [
      [null, "H7", null],
      ["H2", null, "M15"],
      [null, null, null],
    ];
    expect(parsePatternCsv(source)).toEqual(grid);
    const compact = serializePatternCsv(grid);
    expect(compact).toBe(",H7,\nH2,,M15\n,,\n");
    expect(parsePatternCsv(compact)).toEqual(grid);
    expect(compact.length).toBeLessThan(source.length);
  });

  const grids: PatternGrid[] = [
    [[null]],
    [["H7"]],
    [[null], ["H7"], [null]],
    [
      [null, null],
      [null, null],
    ],
    [
      ["H7", null, "H2"],
      [null, "B23", null],
    ],
  ];
  it.each(grids.map((grid) => ({ grid })))("round-trips $grid", ({ grid }) => {
    expect(parsePatternCsv(serializePatternCsv(grid))).toEqual(grid);
  });

  it("retains trailing empty rows and columns", () => {
    expect(parsePatternCsv("H7,\n,\n")).toEqual([
      ["H7", null],
      [null, null],
    ]);
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

  it("rejects missing cells instead of passing a sparse grid to the renderers", () => {
    const row = Array<string | null>(2);
    row[0] = "H7";
    expect(() => createPattern([row])).toThrow("row 1, column 2; expected a color or null");
    expect(() => serializePatternCsv([row])).toThrow("row 1, column 2");
  });

  it("rejects missing rows before deriving a document", () => {
    const rows = Array<(string | null)[]>(2);
    expect(() => createPattern(rows)).toThrow("at least one cell");
    rows[0] = ["H7"];
    expect(() => createPattern(rows)).toThrow("Pattern row 2 must be an array");
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

  it.each(["WARM;RED", "WARM\tRED", 'WARM,"RED"', "WARM\nRED", "SEP=;"])(
    "round-trips custom code %j without mistaking it for CSV syntax",
    (code) => {
      const palette = validatePalette({ colors: { [code]: "#FF0000" } });
      for (const grid of [[[code]], [[code, null]]] as PatternGrid[]) {
        expect(parsePatternCsv(serializePatternCsv(grid, palette), palette)).toEqual(grid);
      }
    },
  );

  it.each([
    null,
    [],
    {},
    { colors: null },
    { colors: [] },
    { colors: {} },
    { colors: { H7: 5 } },
    { colors: { H7: "#GGGGGG" } },
    { colors: { H7: "#000000", h7: "#FFFFFF" } },
    { colors: { "": "#000000" } },
    { colors: { TRANSPARENT: "#000000" } },
    { colors: { "#000000": "#FFFFFF" } },
  ])("rejects invalid external data %j", (palette) => {
    expect(() => validatePalette(palette)).toThrow();
  });
});

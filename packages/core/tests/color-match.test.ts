import { describe, expect, it } from "vitest";
import { defaultPalette, deltaE2000, hexToLab, matchColors, type Lab } from "../src/index.js";

describe("CIEDE2000", () => {
  // Sharma, Wu & Dalal (2005), supplementary reference data, including hue wrap and zero chroma.
  // https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/dataNprograms/ciede2000testdata.txt
  const vectors: [Lab, Lab, number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
    [[50, -0.001, 2.49], [50, 0.0009, -2.49], 4.8045],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
  ];
  it.each(vectors)("matches the reference pair %j / %j", (first, second, expected) => {
    expect(deltaE2000(first, second)).toBeCloseTo(expected, 4);
    expect(deltaE2000(second, first)).toBeCloseTo(expected, 4);
  });
  it("converts sRGB endpoints and rejects invalid hex", () => {
    expect(hexToLab("000")).toEqual([0, 0, 0]);
    const white = hexToLab("#fff");
    expect(white[0]).toBeCloseTo(100, 4);
    expect(white[1]).toBeCloseTo(0, 3);
    expect(white[2]).toBeCloseTo(0, 3);
    expect(() => hexToLab("wrong")).toThrow("Invalid hex color");
  });
});

describe("palette matching", () => {
  it("finds exact matches and keeps neutral inputs neutral", () => {
    for (const match of matchColors(Object.values(defaultPalette.colors), defaultPalette, {
      includeNeutral: true,
    })) {
      expect(match.deltaE).toBe(0);
      expect(match.hex).toBe(match.input);
    }
    expect(matchColors(["#000"])[0]).toMatchObject({ code: "H7", preserveChroma: false });
    expect(matchColors([])).toEqual([]);
  });

  it("preserves the existing tinted and all-color matching policies", () => {
    expect(matchColors(["4c4c40"])[0]).toMatchObject({ code: "B23", preserveChroma: true });
    expect(matchColors(["4c4c40"], defaultPalette, { includeNeutral: true })[0]).toMatchObject({
      code: "H5",
    });
  });

  it("assigns the green pair globally regardless of input order", () => {
    const options = { unique: true, series: ["b"] };
    expect(matchColors(["4D4D3D", "35352A"], defaultPalette, options).map((m) => m.code)).toEqual([
      "B15",
      "B23",
    ]);
    expect(matchColors(["35352A", "4D4D3D"], defaultPalette, options).map((m) => m.code)).toEqual([
      "B23",
      "B15",
    ]);
  });

  it("finds a minimum total assignment, including when greedy reuse would win locally", () => {
    const palette = { colors: { X1: "#000000", X2: "#404040", X3: "#FFFFFF" } };
    const inputs = ["#303030", "#404040"];
    const matches = matchColors(inputs, palette, { unique: true, includeNeutral: true });
    const colors = Object.values(palette.colors);
    const totals = colors.flatMap((first, i) =>
      colors
        .filter((_, j) => i !== j)
        .map(
          (second) =>
            deltaE2000(hexToLab(inputs[0]), hexToLab(first)) +
            deltaE2000(hexToLab(inputs[1]), hexToLab(second)),
        ),
    );
    expect(new Set(matches.map((m) => m.code)).size).toBe(2);
    expect(matches.reduce((sum, m) => sum + m.deltaE, 0)).toBeCloseTo(Math.min(...totals), 10);
  });

  it("reports the neutral fallback when unique assignments exhaust tinted candidates", () => {
    const palette = { colors: { X1: "#00FF00", X2: "#444444" } };
    const matches = matchColors(["#00FF00", "#10F010"], palette, { unique: true });
    expect(matches.filter((m) => m.neutralFallback)).toHaveLength(1);
    expect(matchColors(["00FF00"], { colors: { X1: "#444444" } })[0].preserveChroma).toBe(false);
  });

  it("rejects impossible or invalid restrictions", () => {
    expect(() =>
      matchColors(["000", "fff"], { colors: { X1: "#000000" } }, { unique: true }),
    ).toThrow("at least one palette color");
    expect(() => matchColors(["000"], defaultPalette, { series: ["Z"] })).toThrow(
      "No palette colors",
    );
    expect(() => matchColors(["000"], defaultPalette, { series: ["B7"] })).toThrow(
      "letter prefixes",
    );
  });
});

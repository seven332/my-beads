import { expect, it } from "vitest";
import { defaultPalette } from "@my-beads/core";
import { findPaletteColors } from "../src/palette-search.js";

it("keeps blank and partial searches useful without interpreting incomplete colors", () => {
  expect(findPaletteColors("  ").colors).toHaveLength(221);
  const partial = findPaletteColors(" h ");
  expect(partial.kind).toBe("matches");
  expect(partial.colors.length).toBeGreaterThan(1);
  expect(partial.colors.every((color) => color.code.startsWith("H"))).toBe(true);
  expect(findPaletteColors("#33").colors).toContainEqual({ code: "D22", hex: "#333995" });
  for (const query of [
    "#12",
    "#abcd",
    "#12345678",
    "H99",
    "#xyzxyz",
    "red",
    "rgb(0,0,0)",
    "<script>",
  ]) {
    const result = findPaletteColors(query);
    expect(result.kind).toBe("matches");
    expect(result.inputHex).toBeNull();
  }
});

it("prioritizes every exact code and palette hex over approximate matches", () => {
  for (const [code, hex] of Object.entries(defaultPalette.colors)) {
    expect(findPaletteColors(` ${code.toLowerCase()} `)).toEqual({
      kind: "matches",
      inputHex: null,
      colors: [{ code, hex }],
    });
    const byHex = findPaletteColors(` ${hex.toLowerCase()} `);
    expect(byHex.kind).toBe("matches");
    expect(byHex.inputHex).toBe(hex);
    expect(byHex.colors).toContainEqual({ code, hex });
    expect(byHex.colors.every((color) => color.hex === hex)).toBe(true);
  }
});

it.each(["#000", "000", "#000000", "000000"])("normalizes exact hex %s", (query) => {
  expect(findPaletteColors(query)).toEqual({
    kind: "matches",
    inputHex: "#000000",
    colors: [{ code: "H7", hex: "#000000" }],
  });
});

it("distinguishes MARD codes from hex and full hex from incidental substrings", () => {
  expect(findPaletteColors("B23").colors).toEqual([{ code: "B23", hex: "#303921" }]);
  expect(findPaletteColors("#b23")).toEqual({
    kind: "recommendations",
    inputHex: "#BB2233",
    colors: [{ code: "F8", hex: "#BC0127", rules: ["closest", "chroma"] }],
  });
  expect(findPaletteColors("333")).toEqual({
    kind: "recommendations",
    inputHex: "#333333",
    colors: [{ code: "H6", hex: "#2C2C2C", rules: ["closest", "chroma"] }],
  });
});

it.each(["#4C4C40", " 4c4c40 "])("explains different rule recommendations for %s", (query) => {
  expect(findPaletteColors(query)).toEqual({
    kind: "recommendations",
    inputHex: "#4C4C40",
    colors: [
      { code: "H5", hex: "#474747", rules: ["closest"] },
      { code: "B23", hex: "#303921", rules: ["chroma"] },
    ],
  });
});

it("combines the rules when they recommend the same color", () => {
  expect(findPaletteColors("#ff0000")).toEqual({
    kind: "recommendations",
    inputHex: "#FF0000",
    colors: [{ code: "F13", hex: "#DD422F", rules: ["closest", "chroma"] }],
  });
});

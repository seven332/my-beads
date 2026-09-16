import { expect, it } from "vitest";
import { decodeCsv, parsePatternCsv } from "../src/index.js";

it.each(
  [
    [0x48, 0x37, 0x09, 0x48, 0x32],
    [0xef, 0xbb, 0xbf, 0x48, 0x37, 0x09, 0x48, 0x32],
    [0xff, 0xfe, 0x48, 0, 0x37, 0, 0x09, 0, 0x48, 0, 0x32, 0],
    [0xfe, 0xff, 0, 0x48, 0, 0x37, 0, 0x09, 0, 0x48, 0, 0x32],
  ].map((bytes) => ({ bytes })),
)("decodes supported bytes $bytes", ({ bytes }) => {
  const decoded = decodeCsv(Uint8Array.from(bytes));
  expect(decoded).toBe("H7\tH2");
  expect(parsePatternCsv(decoded)).toEqual([["H7", "H2"]]);
});

it("preserves Unicode custom codes in BOM-marked UTF-16", () => {
  expect(decodeCsv(Uint8Array.from([0xff, 0xfe, 0xe9, 0, 0x3d, 0xd8, 0xa0, 0xdd]))).toBe("é🖠");
  expect(decodeCsv(Uint8Array.from([0xfe, 0xff, 0, 0xe9, 0xd8, 0x3d, 0xdd, 0xa0]))).toBe("é🖠");
});

it.each([[0xff], [0xc3, 0x28], [0xff, 0xfe, 0x48], [0xfe, 0xff, 0], [0xff, 0xfe, 0, 0xd8]])(
  "rejects malformed encoded text %j",
  (...bytes) => {
    expect(() => decodeCsv(Uint8Array.from(bytes))).toThrow("Use UTF-8 or UTF-16");
  },
);

it("keeps an empty file empty for grid validation", () => {
  expect(decodeCsv(new Uint8Array())).toBe("");
  expect(() => parsePatternCsv(decodeCsv(new Uint8Array()))).toThrow(
    "does not contain a pattern grid",
  );
});

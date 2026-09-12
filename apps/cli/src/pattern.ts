import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPattern, parseCsv, validatePalette, type PatternData } from "@my-beads/core";

export const defaultPalettePath = fileURLToPath(
  new URL("../../../packages/core/src/data/mard-221-colors.json", import.meta.url),
);

export async function loadPattern(input: string, palettePath: string): Promise<PatternData> {
  const [csvText, paletteText] = await Promise.all([
    readFile(input, "utf8"),
    readFile(palettePath, "utf8"),
  ]);
  const data = createPattern(parseCsv(csvText), validatePalette(JSON.parse(paletteText)));
  if (!data.counts.size) throw new Error("Pattern does not contain any beads");
  return data;
}

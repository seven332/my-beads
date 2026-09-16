import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createPattern,
  decodeCsv,
  parsePatternCsv,
  validatePalette,
  type PatternData,
} from "@my-beads/core";

export const defaultPalettePath = fileURLToPath(
  new URL("../../../packages/core/src/data/mard-221-colors.json", import.meta.url),
);

export async function loadPattern(input: string, palettePath: string): Promise<PatternData> {
  const [csvBytes, paletteText] = await Promise.all([
    readFile(input),
    readFile(palettePath, "utf8"),
  ]);
  const palette = validatePalette(JSON.parse(paletteText));
  const data = createPattern(parsePatternCsv(decodeCsv(csvBytes), palette), palette);
  if (!data.counts.size) throw new Error("Pattern does not contain any beads");
  return data;
}

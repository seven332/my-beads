import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type PaletteDocument = {
  source?: string;
  scope?: string;
  colors: Record<string, string>;
};

export type PatternCell = {
  code: string;
  hex: string;
  transparent: boolean;
};

export type PatternData = {
  pattern: PatternCell[][];
  counts: Map<string, number>;
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const defaultPalettePath = resolve(scriptDirectory, "data/mard-221-colors.json");
const transparentValues = new Set(["", "TRANSPARENT", "ERASE"]);

function normalizeHex(value: string): string {
  const normalized = value.toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid palette color: ${value}`);
  }
  return normalized;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field.trim());
      field = "";
    } else if (character === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) {
    throw new Error("CSV contains an unterminated quoted field");
  }
  if (field || row.length) {
    row.push(field.trim());
    rows.push(row);
  }

  if (!rows.length || !rows[0].length) {
    throw new Error("CSV does not contain a pattern grid");
  }
  const columns = rows[0].length;
  const unevenRow = rows.findIndex((candidate) => candidate.length !== columns);
  if (unevenRow !== -1) {
    throw new Error(
      `CSV row ${unevenRow + 1} has ${rows[unevenRow].length} columns; expected ${columns}`,
    );
  }
  return rows;
}

export function createPattern(rows: string[][], palette: PaletteDocument): PatternData {
  const colors = Object.fromEntries(
    Object.entries(palette.colors).map(([code, hex]) => [code.toUpperCase(), normalizeHex(hex)]),
  );
  const codesByHex = new Map(Object.entries(colors).map(([code, hex]) => [hex, code]));
  const counts = new Map<string, number>();

  const pattern = rows.map((row, rowIndex) =>
    row.map((rawValue, columnIndex) => {
      const value = rawValue.trim().toUpperCase();
      if (transparentValues.has(value)) {
        return { code: "", hex: "#F7F8F8", transparent: true };
      }

      const hex = value.startsWith("#") ? normalizeHex(value) : colors[value];
      const code = value.startsWith("#") ? codesByHex.get(hex) : value;
      if (!hex || !code) {
        throw new Error(
          `Unknown MARD color '${rawValue}' at row ${rowIndex + 1}, column ${columnIndex + 1}`,
        );
      }
      counts.set(code, (counts.get(code) ?? 0) + 1);
      return { code, hex, transparent: false };
    }),
  );

  if (!counts.size) {
    throw new Error("Pattern does not contain any beads");
  }

  return { pattern, counts };
}

export async function loadPattern(input: string, palettePath: string): Promise<PatternData> {
  const [csvText, paletteText] = await Promise.all([
    readFile(input, "utf8"),
    readFile(palettePath, "utf8"),
  ]);
  const palette = JSON.parse(paletteText) as PaletteDocument;
  if (!palette.colors || typeof palette.colors !== "object") {
    throw new Error("Palette JSON must contain a 'colors' object");
  }
  return createPattern(parseCsv(csvText), palette);
}

import { BeadError } from "./errors.js";
import { defaultPalette, normalizeHex, validatePalette, type PaletteDocument } from "./palette.js";

/** A rectangular document: MARD codes for beads, null for empty cells. */
export type PatternGrid = readonly (readonly (string | null)[])[];
export type PatternCell = {
  readonly code: string;
  readonly hex: string;
  readonly transparent: boolean;
};
export type PatternData = {
  readonly grid: PatternGrid;
  readonly pattern: readonly (readonly PatternCell[])[];
  readonly counts: ReadonlyMap<string, number>;
};

function validateShape(rows: readonly (readonly unknown[])[]): void {
  if (!rows.length || !Array.isArray(rows[0]) || !rows[0].length) {
    throw new BeadError("patternEmpty", "Pattern must contain at least one cell");
  }
  const columns = rows[0].length;
  for (const [rowIndex, row] of rows.entries()) {
    if (!Array.isArray(row))
      throw new BeadError("patternRow", `Pattern row ${rowIndex + 1} must be an array`, {
        row: rowIndex + 1,
      });
    if (row.length !== columns) {
      throw new BeadError(
        "csvColumns",
        `CSV row ${rowIndex + 1} has ${row.length} columns; expected ${columns}`,
        { row: rowIndex + 1, actual: row.length, expected: columns },
      );
    }
  }
}

/** Parse quoted CSV, including BOM, CRLF and explicit empty one-cell documents. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  if (!source.length) throw new BeadError("csvEmpty", "CSV does not contain a pattern grid");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let mode: "start" | "plain" | "quoted" | "closed" = "start";
  let endedRow = false;
  const endField = (): void => {
    row.push(field.trim());
    field = "";
    mode = "start";
  };
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    endedRow = false;
    if (mode === "quoted") {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        mode = "closed";
      } else {
        field += character;
      }
    } else if (character === ",") {
      endField();
    } else if (character === "\n" || character === "\r") {
      endField();
      rows.push(row);
      row = [];
      endedRow = true;
      if (character === "\r" && source[index + 1] === "\n") index += 1;
    } else if (character === '"' && mode === "start") {
      mode = "quoted";
    } else if (character === '"' || (mode === "closed" && character.trim())) {
      throw new BeadError(
        "csvCharacter",
        "CSV contains an unexpected character outside a quoted field",
      );
    } else if (mode !== "closed") {
      field += character;
      if (character.trim()) mode = "plain";
    }
  }
  if (mode === "quoted")
    throw new BeadError("csvQuote", "CSV contains an unterminated quoted field");
  if (!endedRow) {
    endField();
    rows.push(row);
  }
  validateShape(rows);
  return rows;
}

/** Resolve CSV values or a canonical grid; blank documents are valid in the core. */
export function createPattern(
  rows: PatternGrid,
  palette: PaletteDocument = defaultPalette,
): PatternData {
  validateShape(rows);
  const { colors } = validatePalette(palette);
  const codesByHex = new Map(Object.entries(colors).map(([code, hex]) => [hex, code]));
  const counts = new Map<string, number>();
  const pattern = rows.map((row, rowIndex) =>
    Array.from(row, (rawValue, columnIndex) => {
      if (rawValue !== null && typeof rawValue !== "string") {
        throw new BeadError(
          "patternCell",
          `Invalid cell at row ${rowIndex + 1}, column ${columnIndex + 1}; expected a color or null`,
          { row: rowIndex + 1, column: columnIndex + 1 },
        );
      }
      const value = rawValue?.trim().toUpperCase() ?? "";
      if (value === "" || value === "TRANSPARENT" || value === "ERASE") {
        return { code: "", hex: "#F7F8F8", transparent: true };
      }
      const code = value.startsWith("#") ? codesByHex.get(normalizeHex(value)) : value;
      const hex = code === undefined ? undefined : colors[code];
      if (!code || !hex) {
        throw new BeadError(
          "unknownColor",
          `Unknown MARD color '${rawValue}' at row ${rowIndex + 1}, column ${columnIndex + 1}`,
          { value: String(rawValue), row: rowIndex + 1, column: columnIndex + 1 },
        );
      }
      counts.set(code, (counts.get(code) ?? 0) + 1);
      return { code, hex, transparent: false };
    }),
  );
  return {
    grid: pattern.map((row) => row.map((cell) => (cell.transparent ? null : cell.code))),
    pattern,
    counts,
  };
}

export function parsePatternCsv(
  text: string,
  palette: PaletteDocument = defaultPalette,
): PatternGrid {
  return createPattern(parseCsv(text), palette).grid;
}

export function serializePatternCsv(
  grid: PatternGrid,
  palette: PaletteDocument = defaultPalette,
): string {
  const normalized = createPattern(grid, palette).grid;
  // Quote empty cells and custom codes containing CSV delimiters.
  const field = (code: string | null): string => {
    if (code === null) return '""';
    return /[",\r\n]/.test(code) ? '"' + code.replaceAll('"', '""') + '"' : code;
  };
  return normalized.map((row) => row.map(field).join(",")).join("\n") + "\n";
}

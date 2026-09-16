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

function validateShape(rows: readonly (readonly unknown[])[], firstRow = 1): void {
  if (!rows.length || !Array.isArray(rows[0]) || !rows[0].length) {
    throw new BeadError("patternEmpty", "Pattern must contain at least one cell");
  }
  const columns = rows[0].length;
  for (const [rowIndex, row] of rows.entries()) {
    if (!Array.isArray(row))
      throw new BeadError("patternRow", `Pattern row ${rowIndex + firstRow} must be an array`, {
        row: rowIndex + firstRow,
      });
    if (row.length !== columns) {
      throw new BeadError(
        "csvColumns",
        `CSV row ${rowIndex + firstRow} has ${row.length} columns; expected ${columns}`,
        { row: rowIndex + firstRow, actual: row.length, expected: columns },
      );
    }
  }
}

type Delimiter = "," | ";" | "\t";

/** Prefer comma CSV over alternative delimiters and ignore quoted punctuation. */
function detectDelimiter(source: string): Delimiter {
  let quoted = false;
  let semicolon = false;
  let tab = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted) {
      if (character === ",") return ",";
      if (character === ";") semicolon = true;
      if (character === "\t") tab = true;
    }
  }
  return semicolon ? ";" : tab ? "\t" : ",";
}

function parseCsvDocument(text: string): { rows: string[][]; firstRow: number } {
  let source = text.replace(/^\uFEFF/, "");
  const declaration = /^sep=([,;\t])(?:\r\n|\r|\n)/i.exec(source);
  if (declaration) source = source.slice(declaration[0].length);
  const firstRow = declaration ? 2 : 1;
  const delimiter = declaration ? (declaration[1] as Delimiter) : detectDelimiter(source);
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
    } else if (character === delimiter) {
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
        `Unexpected CSV character at row ${rows.length + firstRow}, column ${row.length + 1}`,
        { row: rows.length + firstRow, column: row.length + 1 },
      );
    } else if (mode !== "closed") {
      field += character;
      if (character.trim()) mode = "plain";
    }
  }
  if (mode === "quoted")
    throw new BeadError(
      "csvQuote",
      `Unterminated CSV quoted field at row ${rows.length + firstRow}, column ${row.length + 1}`,
      { row: rows.length + firstRow, column: row.length + 1 },
    );
  if (!endedRow) {
    endField();
    rows.push(row);
  }
  validateShape(rows, firstRow);
  return { rows, firstRow };
}

/** Parse comma, semicolon or tab grids without dropping empty records or cells. */
export function parseCsv(text: string): string[][] {
  return parseCsvDocument(text).rows;
}

function resolvePattern(
  rows: PatternGrid,
  palette: PaletteDocument,
  firstRow: number,
): PatternData {
  validateShape(rows, firstRow);
  const { colors } = validatePalette(palette);
  const codesByHex = new Map(Object.entries(colors).map(([code, hex]) => [hex, code]));
  const counts = new Map<string, number>();
  const pattern = rows.map((row, rowIndex) =>
    Array.from(row, (rawValue, columnIndex) => {
      if (rawValue !== null && typeof rawValue !== "string") {
        throw new BeadError(
          "patternCell",
          `Invalid cell at row ${rowIndex + firstRow}, column ${columnIndex + 1}; expected a color or null`,
          { row: rowIndex + firstRow, column: columnIndex + 1 },
        );
      }
      const value = rawValue?.trim().toUpperCase() ?? "";
      if (value === "" || value === "TRANSPARENT" || value === "ERASE") {
        return { code: "", hex: "#F7F8F8", transparent: true };
      }
      // Codes such as B17 also look like short hex; preserve bead identity first.
      const code = Object.hasOwn(colors, value)
        ? value
        : /^#?(?:[0-9A-F]{3}|[0-9A-F]{6})$/.test(value)
          ? codesByHex.get(normalizeHex(value))
          : undefined;
      const hex = code === undefined ? undefined : colors[code];
      if (!code || !hex) {
        throw new BeadError(
          "unknownColor",
          `Unknown MARD color '${rawValue}' at row ${rowIndex + firstRow}, column ${columnIndex + 1}`,
          { value: String(rawValue), row: rowIndex + firstRow, column: columnIndex + 1 },
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

/** Resolve CSV values or a canonical grid; blank documents are valid in the core. */
export function createPattern(
  rows: PatternGrid,
  palette: PaletteDocument = defaultPalette,
): PatternData {
  return resolvePattern(rows, palette, 1);
}

export function parsePatternCsv(
  text: string,
  palette: PaletteDocument = defaultPalette,
): PatternGrid {
  const { rows, firstRow } = parseCsvDocument(text);
  return resolvePattern(rows, palette, firstRow).grid;
}

export function serializePatternCsv(
  grid: PatternGrid,
  palette: PaletteDocument = defaultPalette,
): string {
  const normalized = createPattern(grid, palette).grid;
  // Keep one-column empty records explicit and quote every supported delimiter.
  const field = (code: string | null): string => {
    if (code === null) return normalized[0].length === 1 ? '""' : "";
    return /[",;\t\r\n]/.test(code) ? '"' + code.replaceAll('"', '""') + '"' : code;
  };
  return normalized.map((row) => row.map(field).join(",")).join("\n") + "\n";
}

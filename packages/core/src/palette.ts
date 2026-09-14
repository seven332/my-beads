import { BeadError } from "./errors.js";
import mard from "./data/mard-221-colors.json" with { type: "json" };

export type PaletteDocument = {
  readonly source?: string;
  readonly scope?: string;
  readonly colors: Readonly<Record<string, string>>;
};

export function normalizeHex(value: string): string {
  let hex = value.trim().replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{3}$/.test(hex)) {
    hex = [...hex].map((character) => character.repeat(2)).join("");
  }
  if (!/^[0-9A-F]{6}$/.test(hex)) {
    throw new BeadError("invalidHex", `Invalid hex color: ${value}`, { value });
  }
  return `#${hex}`;
}

/** Validate external JSON and normalize a fresh palette without mutating the input. */
export function validatePalette(value: unknown): PaletteDocument {
  if (
    typeof value !== "object" ||
    value === null ||
    !("colors" in value) ||
    typeof value.colors !== "object" ||
    value.colors === null ||
    Array.isArray(value.colors)
  ) {
    throw new Error("Palette JSON must contain a 'colors' object");
  }
  const colors: Record<string, string> = {};
  for (const [rawCode, rawHex] of Object.entries(value.colors)) {
    const code = rawCode.trim().toUpperCase();
    if (
      !code ||
      code.startsWith("#") ||
      code === "TRANSPARENT" ||
      code === "ERASE" ||
      Object.hasOwn(colors, code)
    ) {
      throw new Error(`Invalid or duplicate palette code: ${rawCode}`);
    }
    if (typeof rawHex !== "string") throw new Error(`Invalid palette color: ${rawHex}`);
    colors[code] = normalizeHex(rawHex);
  }
  if (!Object.keys(colors).length) throw new Error("Palette must contain at least one color");
  return {
    ...("source" in value && typeof value.source === "string" ? { source: value.source } : {}),
    ...("scope" in value && typeof value.scope === "string" ? { scope: value.scope } : {}),
    colors: Object.freeze(colors),
  };
}

export const defaultPalette: PaletteDocument = Object.freeze(validatePalette(mard));

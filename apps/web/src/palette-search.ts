import { defaultPalette, matchColors, normalizeHex } from "@my-beads/core";

interface PaletteColor {
  readonly code: string;
  readonly hex: string;
}
export type MatchingRule = "closest" | "chroma";
interface Recommendation extends PaletteColor {
  readonly rules: readonly MatchingRule[];
}
export type PaletteSearchResult =
  | {
      readonly kind: "matches";
      readonly inputHex: string | null;
      readonly colors: readonly PaletteColor[];
    }
  | {
      readonly kind: "recommendations";
      readonly inputHex: string;
      readonly colors: readonly Recommendation[];
    };

const colors = Object.entries(defaultPalette.colors).map(([code, hex]) => ({ code, hex }));

/** Exact bead codes take precedence over ambiguous three-digit HEX input. */
export function paletteTargetHex(query: string): string | null {
  const search = query.trim().toUpperCase();
  if (Object.hasOwn(defaultPalette.colors, search)) return defaultPalette.colors[search];
  return /^#?(?:[0-9A-F]{3}|[0-9A-F]{6})$/.test(search) ? normalizeHex(search) : null;
}

export function findPaletteColors(query: string): PaletteSearchResult {
  const search = query.trim().toUpperCase();
  // MARD codes such as B23 also look like three-digit hex colors.
  const exactCode = colors.find((color) => color.code === search);
  if (exactCode) return { kind: "matches", inputHex: null, colors: [exactCode] };

  const inputHex = paletteTargetHex(search);
  if (!inputHex) {
    return {
      kind: "matches",
      inputHex: null,
      colors: colors.filter(({ code, hex }) => `${code} ${hex}`.includes(search)),
    };
  }

  const exactColors = colors.filter((color) => color.hex === inputHex);
  if (exactColors.length) return { kind: "matches", inputHex, colors: exactColors };

  const [closest] = matchColors([inputHex], defaultPalette, { includeNeutral: true });
  const [chroma] = matchColors([inputHex]);
  return {
    kind: "recommendations",
    inputHex,
    colors:
      closest.code === chroma.code
        ? [{ code: closest.code, hex: closest.hex, rules: ["closest", "chroma"] }]
        : [
            { code: closest.code, hex: closest.hex, rules: ["closest"] },
            { code: chroma.code, hex: chroma.hex, rules: ["chroma"] },
          ],
  };
}

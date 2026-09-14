export type BeadErrorCode =
  | "imageSize" | "imageData" | "targetDimensions" | "alpha" | "sampleColors"
  | "series" | "seriesEmpty" | "overrides" | "overrideUnique" | "paletteSize"
  | "invalidHex" | "patternEmpty" | "patternRow" | "csvColumns" | "csvEmpty"
  | "csvCharacter" | "csvQuote" | "patternCell" | "unknownColor" | "chartWidth" | "chartMinimum";

/** Stable validation codes for consumers; the CLI keeps the original English message. */
export class BeadError extends Error {
  constructor(readonly code: BeadErrorCode, message: string,
    readonly values: Readonly<Record<string, string | number>> = {}) {
    super(message);
    this.name = "BeadError";
  }
}

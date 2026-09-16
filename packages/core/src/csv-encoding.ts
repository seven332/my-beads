import { BeadError } from "./errors.js";

/** Decode file bytes without guessing legacy encodings or replacing invalid text. */
export function decodeCsv(bytes: Uint8Array): string {
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : "utf-8";
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    throw new BeadError(
      "csvEncoding",
      "Cannot decode CSV. Use UTF-8 or UTF-16 with a byte order mark (BOM).",
    );
  }
}

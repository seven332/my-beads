import { BeadError } from "@my-beads/core";
import type common from "./i18n/locales/en-US.json";
import { translator, type Translate } from "./i18n/index.js";

type ErrorCode = keyof typeof common.errors;
export class UiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly values: Readonly<Record<string, string | number>> = {},
  ) {
    super(translator("en-US")(($) => $.errors[code], { replace: values }));
    this.name = "UiError";
  }
}

export function captureError(error: unknown): Error {
  return error instanceof Error ? error : new UiError("unexpected", { detail: String(error) });
}

/** Keep errors as data until rendering, so an existing alert changes language too. */
export function errorText(error: unknown, t: Translate): string {
  if (error === "" || error == null) return "";
  if (error instanceof BeadError || error instanceof UiError)
    return t(($) => $.errors[error.code], { replace: error.values });
  return t(($) => $.errors.unexpected, {
    detail: error instanceof Error ? error.message : String(error),
  });
}

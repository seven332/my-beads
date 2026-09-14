import { UiError, errorText, captureError } from "./errors.js";
import type { Translate } from "./i18n/index.js";
import { defaultPalette, type PatternGrid } from "@my-beads/core";

export const DRAFT_KEY = "my-beads.draft";
export interface DraftDocument { grid: PatternGrid; title: string }
export interface DraftStatus { kind: "automatic" | "recovered" | "recoveryFailed" | "saved" | "saveFailed" | null; detail?: unknown; action: "replace" | "retry" | null; error: boolean }
export type DraftStorage = Pick<Storage, "getItem" | "setItem">;

export function decodeDraft(text: string): DraftDocument {
  if (text.length > 1_000_000) throw new UiError("draftSize");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new UiError("draftInvalid"); }
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1) {
    throw new UiError("draftVersion");
  }
  if (!("title" in value) || typeof value.title !== "string" || value.title.length > 100 ||
      !("grid" in value) || !Array.isArray(value.grid) || !value.grid.length || value.grid.length > 256) {
    throw new UiError("draftInvalid");
  }
  const grid: unknown[][] = value.grid;
  const width = Array.isArray(grid[0]) ? grid[0].length : 0;
  if (width < 1 || width > 256 || grid.some(row => !Array.isArray(row) || row.length !== width ||
      row.some(cell => cell !== null && (typeof cell !== "string" || !Object.hasOwn(defaultPalette.colors, cell))))) {
    throw new UiError("draftGrid");
  }
  return { grid: grid as PatternGrid, title: value.title };
}

/** One adapter owns a single local draft; failed recovery never overwrites stored bytes. */
export function createDrafts(storage: () => DraftStorage, notify: (status: DraftStatus) => void) {
  let previous: DraftDocument | undefined;
  let pending: DraftDocument | undefined;
  let scheduled = false, paused = false, disposed = false;
  function load(): DraftDocument | null {
    try {
      const text = storage().getItem(DRAFT_KEY);
      const document = text === null ? null : decodeDraft(text);
      notify({ kind: document ? "recovered" : "automatic", action: null, error: false });
      return document;
    } catch (error) {
      paused = true;
      notify({ kind: "recoveryFailed", detail: captureError(error), action: "replace", error: true });
      return null;
    }
  }
  function flush() {
    scheduled = false;
    if (disposed || paused || !pending) return;
    const snapshot = pending; pending = undefined;
    try {
      storage().setItem(DRAFT_KEY, JSON.stringify({ version: 1, title: snapshot.title, grid: snapshot.grid }));
      notify({ kind: "saved", action: null, error: false });
    } catch {
      paused = true;
      notify({ kind: "saveFailed", action: "retry", error: true });
    }
  }
  return {
    load,
    observe(snapshot: DraftDocument) {
      if (disposed) return;
      const unchanged = !previous || (snapshot.grid === previous.grid && snapshot.title === previous.title);
      previous = snapshot;
      if (unchanged || paused) return;
      pending = snapshot;
      if (!scheduled) { scheduled = true; queueMicrotask(flush); }
    },
    retry(snapshot: DraftDocument) { if (disposed) return; paused = false; pending = snapshot; flush(); },
    flush,
    dispose() { disposed = true; pending = undefined; },
  };
}

export function draftText(status: DraftStatus, t: Translate): string {
  const kind = status.kind;
  if (!kind) return "";
  if (kind === "recoveryFailed") return t($ => $.draft.recoveryFailed, { detail: errorText(status.detail, t) });
  return t($ => $.draft[kind]);
}

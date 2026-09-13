import { defaultPalette, type PatternGrid } from "@my-beads/core";

export const DRAFT_KEY = "my-beads.draft";
export interface DraftDocument { grid: PatternGrid; title: string }
export interface DraftStatus { message: string; action: "replace" | "retry" | null; error: boolean }
export type DraftStorage = Pick<Storage, "getItem" | "setItem">;

export function decodeDraft(text: string): DraftDocument {
  if (text.length > 1_000_000) throw new Error("The saved draft is too large.");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1) {
    throw new Error("The saved draft has an unsupported version.");
  }
  if (!("title" in value) || typeof value.title !== "string" || value.title.length > 100 ||
      !("grid" in value) || !Array.isArray(value.grid) || !value.grid.length || value.grid.length > 256) {
    throw new Error("The saved draft is invalid.");
  }
  const grid: unknown[][] = value.grid;
  const width = Array.isArray(grid[0]) ? grid[0].length : 0;
  if (width < 1 || width > 256 || grid.some(row => !Array.isArray(row) || row.length !== width ||
      row.some(cell => cell !== null && (typeof cell !== "string" || !Object.hasOwn(defaultPalette.colors, cell))))) {
    throw new Error("The saved draft contains an invalid grid or MARD code.");
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
      notify({ message: document ? "Recovered your saved draft." : "Drafts save automatically on this device.", action: null, error: false });
      return document;
    } catch (error) {
      paused = true;
      const message = error instanceof Error ? error.message : "Storage is unavailable.";
      notify({ message: `Draft recovery failed: ${message} Saving is paused; download your work or replace the saved draft.`, action: "replace", error: true });
      return null;
    }
  }
  function flush() {
    scheduled = false;
    if (disposed || paused || !pending) return;
    const snapshot = pending; pending = undefined;
    try {
      storage().setItem(DRAFT_KEY, JSON.stringify({ version: 1, title: snapshot.title, grid: snapshot.grid }));
      notify({ message: "Draft saved on this device.", action: null, error: false });
    } catch {
      paused = true;
      notify({ message: "Draft could not be saved. Storage may be unavailable or full. Download your work to keep it.", action: "retry", error: true });
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

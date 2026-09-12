import { command, computed, state } from "ccstate";
import { createPattern, defaultPalette, floodFill, paintLine, parsePatternCsv,
  type PatternGrid, type Point } from "@my-beads/core";
import type { DraftStatus } from "./drafts.js";

export const MAX_GRID = 256;
export const HISTORY_LIMIT = 100;
export type Tool = "pencil" | "eraser" | "bucket" | "eyedropper" | "pan";
interface History {
  grid: PatternGrid;
  past: readonly PatternGrid[];
  future: readonly PatternGrid[];
  stroke: { before: PatternGrid; last: Point; color: string | null } | null;
  revision: number;
}
export interface Viewport { zoom: number; x: number; y: number }
function blank(width: number, height: number): PatternGrid {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > MAX_GRID || height > MAX_GRID) throw new Error(`Grid dimensions must be integers from 1 to ${MAX_GRID}.`);
  return Array.from({ length: height }, () => Array<string | null>(width).fill(null));
}
function pastWith(past: readonly PatternGrid[], grid: PatternGrid): readonly PatternGrid[] {
  return [...past, grid].slice(-HISTORY_LIMIT);
}
const historyState$ = state<History>({ grid: blank(50, 50), past: [], future: [], stroke: null, revision: 0 });
const titleState$ = state("Untitled pattern");
const toolState$ = state<Tool>("pencil");
const colorState$ = state("H7");
const searchState$ = state("");
const errorState$ = state("");
const importState$ = state(0);
const viewportState$ = state<Viewport>({ zoom: 12, x: 32, y: 32 });
const gridVisibleState$ = state(true);
const codesVisibleState$ = state(false);
const draftStatusState$ = state<DraftStatus>({ message: "", action: null, error: false });
export const draftStatus$ = computed(get => get(draftStatusState$));
export const reportDraft$ = command(({ set }, status: DraftStatus) => { set(draftStatusState$, status); });

export const documentRevision$ = computed(get => get(historyState$).revision);
export const committedDocument$ = computed(get => {
  const history = get(historyState$);
  return { grid: history.stroke?.before ?? history.grid, title: get(titleState$) };
});

export const document$ = computed(get => createPattern(get(historyState$).grid));
export const editor$ = computed(get => {
  const history = get(historyState$);
  const document = get(document$);
  const search = get(searchState$);
  return {
    document, title: get(titleState$), tool: get(toolState$), color: get(colorState$),
    search, error: get(errorState$), viewport: get(viewportState$),
    gridVisible: get(gridVisibleState$), codesVisible: get(codesVisibleState$),
    canUndo: history.past.length > 0 && !history.stroke,
    canRedo: history.future.length > 0 && !history.stroke,
    beads: [...document.counts.values()].reduce((sum, count) => sum + count, 0),
    palette: Object.entries(defaultPalette.colors).filter(([code, hex]) =>
      `${code} ${hex}`.toLowerCase().includes(search.toLowerCase())),
  };
});
export type EditorModel = ReturnType<typeof editor$.read>;

export const reportError$ = command(({ set }, message: string) => { set(errorState$, message); });
export const rename$ = command(({ get, set }, title: string) => {
  set(titleState$, title.slice(0, 100));
  set(historyState$, { ...get(historyState$), revision: get(historyState$).revision + 1 });
});
export const finishStroke$ = command(({ get, set }, cancel = false) => {
  const history = get(historyState$);
  if (!history.stroke) return;
  const before = history.stroke.before;
  const changed = history.grid !== before;
  set(historyState$, { ...history, stroke: null,
    grid: cancel ? before : history.grid,
    past: !cancel && changed ? pastWith(history.past, before) : history.past,
    future: !cancel && changed ? [] : history.future,
    revision: history.revision + 1 });
});
export const chooseTool$ = command(({ set }, tool: Tool) => {
  set(finishStroke$); set(toolState$, tool);
});
export const chooseColor$ = command(({ set }, code: string) => {
  if (!Object.hasOwn(defaultPalette.colors, code)) return;
  set(finishStroke$); set(colorState$, code);
});
export const searchPalette$ = command(({ set }, search: string) => { set(searchState$, search); });
export const toggleGrid$ = command(({ get, set }) => { set(gridVisibleState$, !get(gridVisibleState$)); });
export const toggleCodes$ = command(({ get, set }) => { set(codesVisibleState$, !get(codesVisibleState$)); });
export const moveViewport$ = command(({ get, set }, dx: number, dy: number) => {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const view = get(viewportState$);
  set(viewportState$, { ...view, x: view.x + dx, y: view.y + dy });
});
export const zoom$ = command(({ get, set }, factor: number, anchor: Point = { x: 32, y: 32 }) => {
  const view = get(viewportState$);
  const zoom = Math.max(0.25, Math.min(64, view.zoom * factor));
  if (!Number.isFinite(zoom)) return;
  const ratio = zoom / view.zoom;
  set(viewportState$, { zoom, x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio });
});
export const fitViewport$ = command(({ get, set }, width: number, height: number) => {
  const grid = get(historyState$).grid;
  const zoom = Math.max(0.25, Math.min(32, (width - 64) / grid[0].length, (height - 64) / grid.length));
  set(viewportState$, { zoom, x: (width - grid[0].length * zoom) / 2, y: (height - grid.length * zoom) / 2 });
});
export const beginStroke$ = command(({ get, set }, point: Point) => {
  set(finishStroke$);
  const history = get(historyState$);
  const cell = history.grid[point.y]?.[point.x];
  if (cell === undefined) return;
  const tool = get(toolState$);
  if (tool === "pan") return;
  if (tool === "eyedropper") { if (cell) set(colorState$, cell); return; }
  const color = tool === "eraser" ? null : get(colorState$);
  const grid = tool === "bucket" ? floodFill(history.grid, point, color) : paintLine(history.grid, point, point, color);
  if (tool === "bucket") {
    if (grid !== history.grid) set(historyState$, { ...history, grid,
      past: pastWith(history.past, history.grid), future: [], revision: history.revision + 1 });
  } else {
    set(historyState$, { ...history, grid,
      stroke: { before: history.grid, last: point, color }, revision: history.revision + 1 });
  }
});
export const extendStroke$ = command(({ get, set }, point: Point) => {
  const history = get(historyState$);
  if (!history.stroke || !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) return;
  set(historyState$, { ...history,
    grid: paintLine(history.grid, history.stroke.last, point, history.stroke.color),
    stroke: { ...history.stroke, last: point }, revision: history.revision + 1 });
});
export const undo$ = command(({ get, set }) => {
  set(finishStroke$);
  const history = get(historyState$);
  if (!history.past.length) return;
  set(historyState$, { ...history, grid: history.past.at(-1)!, past: history.past.slice(0, -1),
    future: [...history.future, history.grid], revision: history.revision + 1 });
});
export const redo$ = command(({ get, set }) => {
  set(finishStroke$);
  const history = get(historyState$);
  if (!history.future.length) return;
  set(historyState$, { ...history, grid: history.future.at(-1)!, future: history.future.slice(0, -1),
    past: pastWith(history.past, history.grid), revision: history.revision + 1 });
});
const replaceDocument$ = command(({ get, set }, grid: PatternGrid, title: string) => {
  if (grid.length > MAX_GRID || grid[0].length > MAX_GRID) throw new Error(`Editor grids support up to ${MAX_GRID} × ${MAX_GRID} cells.`);
  set(historyState$, { grid, past: [], future: [], stroke: null, revision: get(historyState$).revision + 1 });
  set(titleState$, title.slice(0, 100)); set(errorState$, "");
  set(viewportState$, { zoom: 12, x: 32, y: 32 });
});
export const restoreDocument$ = command(({ set }, grid: PatternGrid, title: string) => {
  set(replaceDocument$, createPattern(grid).grid, title);
});
export const replaceIfCurrent$ = command(({ get, set }, revision: number, grid: PatternGrid, title: string) => {
  if (get(historyState$).revision !== revision || get(historyState$).stroke) return false;
  set(restoreDocument$, grid, title);
  return true;
});
export const newDocument$ = command(({ set }, width: number, height: number) => {
  try { set(replaceDocument$, blank(width, height), "Untitled pattern"); }
  catch (error) { set(errorState$, error instanceof Error ? error.message : "Unable to create grid."); }
});

export interface CsvFile { name: string; size: number; text(): Promise<string> }
export const importCsv$ = command(async ({ get, set }, file: CsvFile, signal: AbortSignal) => {
  signal.throwIfAborted();
  const token = get(importState$) + 1;
  const revision = get(historyState$).revision;
  set(importState$, token); set(errorState$, "");
  try {
    if (file.size > 2_000_000) throw new Error("CSV files must be smaller than 2 MB.");
    const text = await file.text();
    signal.throwIfAborted();
    if (get(importState$) !== token) return false;
    if (get(historyState$).revision !== revision) {
      set(errorState$, "Import cancelled because the pattern changed. Open the file again to replace it."); return false;
    }
    const grid = parsePatternCsv(text);
    set(replaceDocument$, grid, file.name.replace(/\.csv$/i, ""));
    return true;
  } catch (error) {
    signal.throwIfAborted();
    if (get(importState$) === token && get(historyState$).revision === revision)
      set(errorState$, error instanceof Error ? error.message : "Unable to read CSV.");
    return false;
  }
});

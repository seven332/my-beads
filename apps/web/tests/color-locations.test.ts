import { expect, it } from "vitest";
import { createStore } from "ccstate";
import { colorBounds } from "../src/color-locations.js";
import * as state from "../src/state.js";

it("bounds disconnected, hollow and border-touching colors without including empty cells", () => {
  const grid = [["H7", "H7", "H7", null], ["H7", "H2", "H7", null], ["H7", "H7", "H7", "H2"]];
  expect(colorBounds(grid, "H7")).toEqual({ x: 0, y: 0, width: 3, height: 3 });
  expect(colorBounds(grid, "H2")).toEqual({ x: 1, y: 1, width: 3, height: 2 });
  expect(colorBounds(grid, "H5")).toBeNull();
  expect(colorBounds([[null]], "H7")).toBeNull();
});

it("derives naturally ordered live counts and preserves the chosen view through edits", () => {
  const store = createStore();
  store.set(state.restoreDocument$, [["H10", "H2", "H10", "A2", null]], "Colors");
  expect(store.get(state.editor$).paletteView).toBe("used");
  expect(store.get(state.editor$).usedColors).toEqual([["A2", 1], ["H2", 1], ["H10", 2]]);
  const used = store.get(state.editor$).usedColors;
  store.set(state.moveViewport$, 10, 5);
  store.set(state.chooseColor$, "H7");
  expect(store.get(state.editor$).usedColors).toBe(used);
  store.set(state.selectPaletteView$, "all");
  store.set(state.beginStroke$, { x: 4, y: 0 });
  expect(store.get(state.editor$).usedColors).toContainEqual(["H7", 1]);
  expect(store.get(state.editor$).paletteView).toBe("all");
  store.set(state.finishStroke$, true);
  expect(store.get(state.editor$).usedColors).toEqual(used);
});

it("locates independently of brush, live strokes, history, document revision and draft contents", () => {
  const store = createStore(), other = createStore();
  store.set(state.restoreDocument$, [["H7", "H2", null]], "Colors");
  store.set(state.chooseColor$, "H5");
  store.set(state.beginStroke$, { x: 2, y: 0 }); store.set(state.finishStroke$);
  store.set(state.undo$);
  const before = store.get(state.editor$), revision = store.get(state.documentRevision$), draft = store.get(state.committedDocument$);
  store.set(state.highlightColor$, "H7");
  store.set(state.selectPaletteView$, "all");
  const after = store.get(state.editor$);
  expect(after.highlightedColor).toBe("H7");
  expect(after.color).toBe("H5"); expect(after.tool).toBe(before.tool);
  expect(after.viewport).toBe(before.viewport); expect(after.document).toBe(before.document);
  expect(after.canUndo).toBe(before.canUndo); expect(after.canRedo).toBe(true);
  expect(store.get(state.documentRevision$)).toBe(revision);
  expect(store.get(state.committedDocument$)).toBe(draft);
  expect(other.get(state.editor$).highlightedColor).toBeNull();
  store.set(state.beginStroke$, { x: 2, y: 0 });
  const live = store.get(state.editor$), liveRevision = store.get(state.documentRevision$);
  store.set(state.highlightColor$, "H2");
  expect(store.get(state.editor$).document).toBe(live.document);
  expect(store.get(state.documentRevision$)).toBe(liveRevision);
  expect(store.get(state.editor$).canUndo).toBe(false);
  store.set(state.finishStroke$, true);
  expect(store.get(state.editor$).canRedo).toBe(true);
});

it("retains zero-count highlights for undo, toggles safely and resets on replacement only", () => {
  const store = createStore();
  store.set(state.restoreDocument$, [["H7", "H2"]], "Colors");
  store.set(state.highlightColor$, "H7");
  store.set(state.chooseTool$, "eraser");
  store.set(state.beginStroke$, { x: 0, y: 0 }); store.set(state.finishStroke$);
  expect(store.get(state.editor$).highlightedColor).toBe("H7");
  expect(store.get(state.editor$).document.counts.has("H7")).toBe(false);
  const viewport = store.get(state.editor$).viewport;
  store.set(state.fitHighlightedColor$, { x: 0, y: 0, width: 500, height: 400 });
  expect(store.get(state.editor$).viewport).toBe(viewport);
  store.set(state.undo$);
  expect(store.get(state.editor$).document.counts.get("H7")).toBe(1);
  store.set(state.highlightColor$, "INVALID");
  expect(store.get(state.editor$).highlightedColor).toBe("H7");
  store.set(state.showCreate$); store.set(state.showEditor$);
  expect(store.get(state.editor$).highlightedColor).toBe("H7");
  store.set(state.highlightColor$, "H7");
  expect(store.get(state.editor$).highlightedColor).toBeNull();
  store.set(state.highlightColor$, "H2"); store.set(state.newDocument$, 1, 1);
  expect(store.get(state.editor$).highlightedColor).toBeNull();
  expect(store.get(state.editor$).paletteView).toBe("all");
  store.set(state.restoreDocument$, [["H7"]], "New");
  store.set(state.highlightColor$, "H7"); store.set(state.highlightColor$, null);
  expect(store.get(state.editor$).highlightedColor).toBeNull();
});

it("fits all occurrences into an offset unobscured area without changing the document", () => {
  const store = createStore();
  store.set(state.restoreDocument$, [[null, "H7", null, "H7", "H2"]], "Bounds");
  store.set(state.highlightColor$, "H7");
  const before = store.get(state.editor$), revision = store.get(state.documentRevision$);
  store.set(state.fitHighlightedColor$, { x: 100, y: 60, width: 124, height: 100 });
  expect(store.get(state.editor$).viewport).toEqual({ zoom: 20, x: 112, y: 100 });
  expect(store.get(state.editor$).document).toBe(before.document);
  expect(store.get(state.documentRevision$)).toBe(revision);
});

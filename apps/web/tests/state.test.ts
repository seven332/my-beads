import { createStore } from "ccstate";
import { expect, it } from "vitest";
import * as state from "../src/state.js";

it("searching preserves selection, the document, live strokes and both history directions", () => {
  const store = createStore(); store.set(state.newDocument$, 2, 1);
  store.set(state.beginStroke$, { x: 0, y: 0 }); store.set(state.finishStroke$);
  store.set(state.chooseColor$, "H2");
  store.set(state.beginStroke$, { x: 1, y: 0 }); store.set(state.finishStroke$);
  store.set(state.undo$);
  const before = store.get(state.editor$), revision = store.get(state.documentRevision$);
  expect(before.canUndo && before.canRedo).toBe(true);
  for (const query of ["#4C4C40", "#FF0000", "H7", "invalid", ""]) {
    store.set(state.searchPalette$, query);
    const after = store.get(state.editor$);
    expect(after.document).toBe(before.document);
    expect(after.color).toBe("H2");
    expect(after.canUndo && after.canRedo).toBe(true);
    expect(store.get(state.documentRevision$)).toBe(revision);
  }
  store.set(state.redo$);
  expect(store.get(state.editor$).document.grid).toEqual([["H7", "H2"]]);
  store.set(state.undo$);
  store.set(state.beginStroke$, { x: 1, y: 0 });
  const live = store.get(state.editor$), liveRevision = store.get(state.documentRevision$);
  store.set(state.searchPalette$, "#4C4C40");
  expect(store.get(state.editor$).document).toBe(live.document);
  expect(store.get(state.editor$).canUndo).toBe(false);
  expect(store.get(state.documentRevision$)).toBe(liveRevision);
  expect(store.get(state.committedDocument$).grid).toEqual([["H7", null]]);
  store.set(state.finishStroke$, true);
  expect(store.get(state.editor$).canRedo).toBe(true);
  store.set(state.undo$);
  expect(store.get(state.editor$).document.grid).toEqual([[null, null]]);
});

it("reuses search results while choosing colors, navigating and drawing", () => {
  const store = createStore(); store.set(state.searchPalette$, "#4C4C40");
  const result = store.get(state.editor$).paletteSearch;
  store.set(state.chooseColor$, "B23");
  expect(store.get(state.editor$).paletteSearch).toBe(result);
  store.set(state.zoom$, 2, { x: 44, y: 44 });
  expect(store.get(state.editor$).paletteSearch).toBe(result);
  store.set(state.moveViewport$, 5, 7);
  expect(store.get(state.editor$).paletteSearch).toBe(result);
  store.set(state.beginStroke$, { x: 0, y: 0 });
  expect(store.get(state.editor$).paletteSearch).toBe(result);
  store.set(state.finishStroke$);
  expect(store.get(state.editor$).paletteSearch).toBe(result);
  expect(store.get(state.editor$).document.grid[0][0]).toBe("B23");
});

it("groups a continuous stroke, derives counts and keeps stores isolated", () => {
  const store = createStore(), other = createStore();
  store.set(state.newDocument$, 5, 2);
  store.set(state.beginStroke$, { x: 0, y: 0 });
  store.set(state.extendStroke$, { x: 4, y: 0 });
  expect(store.get(state.editor$).canUndo).toBe(false);
  store.set(state.finishStroke$);
  expect(store.get(state.editor$).beads).toBe(5);
  expect(other.get(state.editor$).beads).toBe(0);
  store.set(state.undo$);
  expect(store.get(state.editor$).beads).toBe(0);
  expect(store.get(state.editor$).canUndo).toBe(false);
  store.set(state.redo$);
  expect(store.get(state.editor$).beads).toBe(5);
  store.set(state.chooseTool$, "eraser");
  store.set(state.beginStroke$, { x: 2, y: 0 }); store.set(state.finishStroke$);
  expect(store.get(state.editor$).beads).toBe(4);
  store.set(state.undo$);
  store.set(state.chooseColor$, "H2"); store.set(state.chooseTool$, "bucket");
  store.set(state.beginStroke$, { x: 0, y: 1 });
  expect(store.get(state.editor$).document.grid).toEqual([Array(5).fill("H7"), Array(5).fill("H2")]);
  expect(store.get(state.editor$).canRedo).toBe(false);
  store.set(state.chooseTool$, "eyedropper"); store.set(state.beginStroke$, { x: 0, y: 0 });
  expect(store.get(state.editor$).color).toBe("H7");
});

it("rolls back interrupted strokes and skips no-op history entries", () => {
  const store = createStore(); store.set(state.newDocument$, 2, 1);
  store.set(state.beginStroke$, { x: 0, y: 0 }); store.set(state.finishStroke$, true);
  expect(store.get(state.editor$).beads).toBe(0);
  expect(store.get(state.editor$).canUndo).toBe(false);
  store.set(state.chooseTool$, "eraser");
  store.set(state.beginStroke$, { x: 1, y: 0 }); store.set(state.finishStroke$);
  expect(store.get(state.editor$).canUndo).toBe(false);
  store.set(state.newDocument$, NaN, 1);
  expect(store.get(state.editor$).error).toContain("integers");
  expect(store.get(state.editor$).document.grid).toEqual([[null, null]]);
});

it("caps undo history and centers zoom on its anchor", () => {
  const store = createStore(); store.set(state.newDocument$, 1, 1);
  for (let i = 0; i < 110; i++) {
    store.set(state.chooseColor$, i % 2 ? "H7" : "H2");
    store.set(state.beginStroke$, { x: 0, y: 0 }); store.set(state.finishStroke$);
  }
  for (let i = 0; i < 100; i++) store.set(state.undo$);
  expect(store.get(state.editor$).canUndo).toBe(false);
  expect(store.get(state.editor$).beads).toBe(1);
  store.set(state.zoom$, 2, { x: 44, y: 44 });
  expect(store.get(state.editor$).viewport).toEqual({ zoom: 24, x: 20, y: 20 });
  store.set(state.moveViewport$, 5, -7);
  expect(store.get(state.editor$).viewport).toEqual({ zoom: 24, x: 25, y: 13 });
});

it("fits a maximum-size grid inside a small viewport and draws through the boundary", () => {
  const store = createStore(); store.set(state.newDocument$, 256, 256);
  store.set(state.fitViewport$, 320, 360);
  const viewport = store.get(state.editor$).viewport;
  expect(viewport.zoom * 256).toBeLessThanOrEqual(256);
  store.set(state.newDocument$, 4, 1);
  store.set(state.beginStroke$, { x: 0, y: 0 });
  store.set(state.extendStroke$, { x: 20, y: 0 }); store.set(state.finishStroke$);
  expect(store.get(state.editor$).beads).toBe(4);
  store.set(state.undo$); expect(store.get(state.editor$).beads).toBe(0);
});

it("imports canonical CSV and preserves the document when validation fails", async () => {
  const store = createStore(), controller = new AbortController();
  await store.set(state.importCsv$, { name: "Test.csv", size: 12, text: async () => 'H7,""\nH2,H7' }, controller.signal);
  expect(store.get(state.editor$).title).toBe("Test");
  expect(store.get(state.editor$).beads).toBe(3);
  await store.set(state.importCsv$, { name: "bad.csv", size: 1, text: async () => "INVALID" }, controller.signal);
  expect(store.get(state.editor$).error).toContain("INVALID");
  expect(store.get(state.editor$).beads).toBe(3);
  controller.abort();
});

it("does not apply stale reads after another import, new grid, edits or unmount", async () => {
  for (const replacement of ["import", "new", "edit", "abort"] as const) {
    const store = createStore(), controller = new AbortController();
    const deferred = Promise.withResolvers<string>();
    const pending = store.set(state.importCsv$, { name: "old.csv", size: 1, text: () => deferred.promise }, controller.signal);
    const observed = pending.catch(error => error);
    if (replacement === "import") await store.set(state.importCsv$, { name: "new.csv", size: 1, text: async () => "H2" }, controller.signal);
    if (replacement === "new") store.set(state.newDocument$, 2, 3);
    if (replacement === "edit") { store.set(state.beginStroke$, { x: 0, y: 0 }); store.set(state.finishStroke$); }
    if (replacement === "abort") controller.abort();
    deferred.resolve("H5"); await observed;
    expect(store.get(state.editor$).document.grid[0][0]).not.toBe("H5");
    expect(store.get(state.editor$).title).not.toBe("old");
    controller.abort();
  }
});

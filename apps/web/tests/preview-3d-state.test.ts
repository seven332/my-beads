import { createStore } from "ccstate";
import { expect, it } from "vitest";
import * as state from "../src/state.js";
import {
  openPreview$,
  closePreview$,
  previewSession$,
  reportPreview$,
  togglePreviewShadows$,
  selectPreviewMode$,
} from "../src/preview-3d-state.js";

it("only opens in the editor and commits a live stroke exactly once before the snapshot", () => {
  const store = createStore();
  store.set(openPreview$);
  expect(store.get(previewSession$)).toBeNull();
  store.set(state.newDocument$, 3, 2);
  store.set(state.beginStroke$, { x: 0, y: 0 });
  store.set(state.extendStroke$, { x: 2, y: 0 });
  store.set(openPreview$);
  expect(store.get(previewSession$)?.grid).toEqual([
    ["H7", "H7", "H7"],
    [null, null, null],
  ]);
  expect(store.get(state.committedDocument$).grid).toEqual(store.get(previewSession$)?.grid);
  store.set(closePreview$);
  store.set(state.undo$);
  expect(store.get(state.editor$).beads).toBe(0);
  expect(store.get(state.editor$).canUndo).toBe(false);
  store.set(state.redo$);
  expect(store.get(state.editor$).beads).toBe(3);
});

it("switches only ready sessions and keeps mode out of the document and subsequent sessions", () => {
  const store = createStore();
  store.set(state.newDocument$, 2, 2);
  store.set(openPreview$);
  const id = store.get(previewSession$)!.id;
  const document = store.get(state.committedDocument$);
  store.set(selectPreviewMode$, "fused");
  expect(store.get(previewSession$)?.mode).toBe("board");
  store.set(reportPreview$, id, "ready", true);
  store.set(selectPreviewMode$, "fused");
  const selected = store.get(previewSession$);
  store.set(selectPreviewMode$, "fused");
  expect(store.get(previewSession$)).toBe(selected);
  expect(selected?.mode).toBe("fused");
  expect(store.get(state.committedDocument$)).toBe(document);
  store.set(reportPreview$, id, "failed");
  store.set(selectPreviewMode$, "board");
  expect(store.get(previewSession$)?.mode).toBe("fused");
  store.set(closePreview$);
  store.set(openPreview$);
  expect(store.get(previewSession$)?.mode).toBe("board");
});

it("keeps shadows session-only, requires readiness/support and resets after failure or reopen", () => {
  const store = createStore();
  store.set(state.newDocument$, 2, 2);
  store.set(openPreview$);
  const id = store.get(previewSession$)!.id;
  const draft = store.get(state.committedDocument$);
  store.set(togglePreviewShadows$);
  expect(store.get(previewSession$)?.shadows).toBe(false);
  store.set(reportPreview$, id, "ready", false);
  store.set(togglePreviewShadows$);
  expect(store.get(previewSession$)?.shadows).toBe(false);
  store.set(reportPreview$, id, "ready", true);
  store.set(togglePreviewShadows$);
  expect(store.get(previewSession$)?.shadows).toBe(true);
  expect(store.get(state.committedDocument$)).toBe(draft);
  store.set(reportPreview$, id, "failed");
  expect(store.get(previewSession$)?.shadows).toBe(false);
  store.set(closePreview$);
  store.set(openPreview$);
  store.set(reportPreview$, id, "ready", true);
  expect(store.get(previewSession$)).toMatchObject({ shadows: false, shadowsAvailable: false });
});

it("preserves both history directions and presentation state; rejects late status after reopen", () => {
  const store = createStore();
  store.set(state.newDocument$, 2, 1);
  for (const x of [0, 1]) {
    store.set(state.beginStroke$, { x, y: 0 });
    store.set(state.finishStroke$);
  }
  store.set(state.undo$);
  store.set(state.rename$, "Garden");
  store.set(state.chooseTool$, "eraser");
  store.set(state.chooseColor$, "B15");
  store.set(state.moveViewport$, 17, -24);
  const before = store.get(state.editor$);
  const draft = store.get(state.committedDocument$);
  store.set(openPreview$);
  const id = store.get(previewSession$)!.id;
  store.set(reportPreview$, id, "ready");
  store.set(closePreview$);
  expect(store.get(state.editor$)).toBe(before);
  expect(store.get(state.committedDocument$)).toBe(draft);
  store.set(state.redo$);
  store.set(openPreview$);
  expect(store.get(previewSession$)?.beads).toBe(2);
  store.set(reportPreview$, id, "failed");
  expect(store.get(previewSession$)?.status).toBe("loading");
});

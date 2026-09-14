import { expect, it } from "vitest";
import { createStore } from "ccstate";
import { unobscuredArea } from "../src/canvas-viewport.js";
import { newDocument$, fitViewport$, editor$, showPalette$ } from "../src/state.js";

it("frames the unobscured area relative to an offset canvas and actual panel edges", () => {
  expect(
    unobscuredArea({ x: 100, y: 200, width: 1000, height: 800 }, [
      { edge: "top", x: 120, y: 220, width: 400, height: 50 },
      { edge: "left", x: 120, y: 300, width: 40, height: 200 },
      { edge: "right", x: 800, y: 300, width: 280, height: 400 },
      { edge: "bottom", x: 700, y: 930, width: 380, height: 50 },
    ]),
  ).toEqual({ x: 60, y: 70, width: 640, height: 660 });
});

it("ignores hidden and offscreen panels and bounds an overconstrained area", () => {
  const canvas = { x: 0, y: 0, width: 320, height: 390 };
  expect(
    unobscuredArea(canvas, [
      { edge: "right", x: 0, y: 0, width: 0, height: 0 },
      { edge: "top", x: 0, y: -100, width: 320, height: 50 },
    ]),
  ).toEqual(canvas);
  expect(
    unobscuredArea(canvas, [
      { edge: "top", x: 0, y: 0, width: 320, height: 450 },
      { edge: "bottom", x: 0, y: 100, width: 320, height: 100 },
    ]),
  ).toEqual({ x: 0, y: 389, width: 320, height: 1 });
});

it("fits within an offset area and keeps document and viewport when toggling palette", () => {
  const store = createStore();
  store.set(newDocument$, 20, 10);
  store.set(fitViewport$, 464, 264, { x: 100, y: 80 });
  const before = store.get(editor$);
  expect(before.viewport).toEqual({ zoom: 20, x: 132, y: 112 });
  store.set(showPalette$, true);
  expect(store.get(editor$).document).toBe(before.document);
  expect(store.get(editor$).viewport).toBe(before.viewport);
  expect(store.get(editor$).canUndo).toBe(false);
  store.set(showPalette$, false);
  expect(store.get(editor$)).toEqual(before);
});

import { createStore } from "ccstate";
import { expect, it } from "vitest";
import { convertImage, type ImageConversionResult } from "@my-beads/core";
import {
  applyImage$,
  cancelImage$,
  changeImageSettings$,
  imageSession$,
  loadImage$,
  updateImage$,
} from "../src/image-state.js";
import { editor$, rename$ } from "../src/state.js";
import { convertInTest } from "./image-test-helpers.js";

const pixels = { width: 2, height: 1, data: Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 255]) };
const source = { name: "Photo.JPEG", read: async () => pixels };
it("starts ordinary images at source proportions and commits only a completed conversion", async () => {
  const store = createStore(),
    signal = new AbortController().signal;
  await store.set(loadImage$, source, signal);
  expect(store.get(imageSession$)?.options).toMatchObject({
    columns: 2,
    rows: 1,
    mode: "image",
    maxColors: 24,
    lockAspect: true,
  });
  expect(store.set(applyImage$)).toBe(false);
  await store.set(updateImage$, convertInTest, signal);
  expect(store.set(applyImage$)).toBe(true);
  expect(store.get(editor$).title).toBe("Photo");
  expect(store.get(editor$).document.grid).toEqual([["H7", "H2"]]);
});
it.each(["settings", "newer", "cancel", "replace", "document", "abort"])(
  "rejects a late conversion after %s",
  async (action) => {
    const store = createStore(),
      controller = new AbortController();
    await store.set(loadImage$, source, controller.signal);
    await store.set(updateImage$, convertInTest, controller.signal);
    const original = store.get(imageSession$)!;
    const pending = Promise.withResolvers<ImageConversionResult>();
    const working = store.set(updateImage$, () => pending.promise, controller.signal);
    const handled = working.catch((error) => error);
    expect(store.get(imageSession$)?.settingsDirty).toBe(true);
    expect(store.get(imageSession$)?.preview).toBe(original.preview);
    expect(store.set(applyImage$)).toBe(false);
    if (action === "settings" || action === "newer")
      store.set(changeImageSettings$, { ...original.options, columns: 1 });
    if (action === "newer") await store.set(updateImage$, convertInTest, controller.signal);
    if (action === "cancel") store.set(cancelImage$);
    if (action === "replace")
      await store.set(loadImage$, { ...source, name: "Next.png" }, controller.signal);
    if (action === "document") store.set(rename$, "Changed");
    if (action === "abort") controller.abort();
    const before = store.get(imageSession$);
    pending.resolve(convertImage(pixels, original.options));
    await handled;
    if (action === "document") {
      expect(store.get(imageSession$)?.error).toContain("pattern changed");
      expect(store.set(applyImage$)).toBe(false);
    } else expect(store.get(imageSession$)).toEqual(before);
  },
);

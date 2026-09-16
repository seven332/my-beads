import { createStore } from "ccstate";
import { expect, it } from "vitest";
import {
  loadImage$,
  imageSession$,
  updateImage$,
  overrideImage$,
  applyImage$,
  cancelImage$,
  changeImageSettings$,
} from "../src/image-state.js";
import {
  newDocument$,
  editor$,
  beginStroke$,
  finishStroke$,
  importCsv$,
  rename$,
} from "../src/state.js";
import { defaultPalette, type RgbaImage } from "@my-beads/core";

const pixels: RgbaImage = {
  width: 2,
  height: 1,
  data: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]),
};
it("uses the latest settings when decoding finishes", async () => {
  const store = createStore(),
    pending = Promise.withResolvers<RgbaImage>();
  const loading = store.set(
    loadImage$,
    { name: "Loading.png", read: () => pending.promise },
    new AbortController().signal,
  );
  store.set(changeImageSettings$, { columns: 3, rows: 1, alpha: 128 });
  expect(store.set(applyImage$)).toBe(false);
  pending.resolve(pixels);
  await loading;
  expect(store.get(imageSession$)?.settingsDirty).toBe(false);
  expect(store.get(imageSession$)?.preview?.mapped.grid).toEqual([["H7", "H2", "H2"]]);
  expect(store.set(applyImage$)).toBe(true);
});
it("retains read failures when settings change before or after decoding fails", async () => {
  const store = createStore();
  const pending = Promise.withResolvers<RgbaImage>();
  const loading = store.set(
    loadImage$,
    { name: "Broken.png", read: () => pending.promise },
    new AbortController().signal,
  );
  store.set(changeImageSettings$, { columns: 3, rows: 1, alpha: 128 });
  pending.reject(new Error("Unable to decode image"));
  await loading;
  expect(store.get(imageSession$)?.settingsDirty).toBe(false);
  expect(store.get(imageSession$)?.error).toContain("Unable to decode image");
  store.set(changeImageSettings$, { columns: 4, rows: 1, alpha: 128 });
  expect(store.get(imageSession$)?.error).toContain("Unable to decode image");
  expect(store.get(imageSession$)?.settingsDirty).toBe(false);
  expect(store.get(imageSession$)?.preview).toBeNull();
  expect(store.set(applyImage$)).toBe(false);
});
it("uses the full palette for previews and cross-prefix overrides without editing until Apply", async () => {
  const store = createStore(),
    signal = new AbortController().signal;
  store.set(newDocument$, 2, 1);
  await store.set(loadImage$, { name: "Beads.png", read: async () => pixels }, signal);
  expect(store.get(editor$).beads).toBe(0);
  expect(store.get(imageSession$)?.preview?.mapped.grid).toEqual([["H7", "H2"]]);
  expect(store.get(imageSession$)?.preview?.mapped.candidates).toEqual(
    Object.entries(defaultPalette.colors),
  );
  store.set(overrideImage$, "#FFFFFF", "B15");
  store.set(changeImageSettings$, { columns: 4, rows: 1, alpha: 128, unique: true });
  expect(store.set(applyImage$)).toBe(false);
  store.set(updateImage$);
  expect(store.get(imageSession$)?.preview?.mapped.candidates).toEqual(
    Object.entries(defaultPalette.colors),
  );
  expect(store.get(imageSession$)?.overrides).toEqual({ "#FFFFFF": "B15" });
  expect(store.get(imageSession$)?.preview?.mapped.grid).toEqual([["H7", "H7", "B15", "B15"]]);
  store.set(overrideImage$, "#FFFFFF", "");
  expect(store.get(imageSession$)?.preview?.mapped.grid).toEqual([["H7", "H7", "H2", "H2"]]);
  store.set(overrideImage$, "#FFFFFF", "B15");
  expect(store.get(editor$).beads).toBe(0);
  expect(store.set(applyImage$)).toBe(true);
  expect(store.get(editor$).document.grid).toEqual([["H7", "H7", "B15", "B15"]]);
  expect(store.get(editor$).title).toBe("Beads");
  expect(store.get(editor$).canUndo).toBe(false);
  expect(store.get(imageSession$)).toBeNull();
});
it("preserves work on invalid preview, cancellation and stale Apply", async () => {
  const store = createStore(),
    signal = new AbortController().signal;
  store.set(newDocument$, 2, 1);
  await store.set(loadImage$, { name: "Test.png", read: async () => pixels }, signal);
  const preview = store.get(imageSession$)?.preview;
  store.set(changeImageSettings$, { columns: 0, rows: 1, alpha: 128 });
  store.set(updateImage$);
  expect(store.get(imageSession$)?.error).toContain("dimensions");
  expect(store.get(imageSession$)?.preview).toBe(preview);
  expect(store.set(applyImage$)).toBe(false);
  store.set(changeImageSettings$, { columns: 2, rows: 1, alpha: 128 });
  store.set(updateImage$);
  store.set(rename$, "New title");
  expect(store.set(applyImage$)).toBe(false);
  expect(store.get(imageSession$)?.error).toContain("pattern changed");
  store.set(cancelImage$);
  expect(store.get(editor$).beads).toBe(0);
  expect(store.get(editor$).title).toBe("New title");
});
it("keeps invalid mapping inputs until all errors are corrected or cleared", async () => {
  const store = createStore();
  store.set(newDocument$, 2, 1);
  await store.set(
    loadImage$,
    { name: "Colors.png", read: async () => pixels },
    new AbortController().signal,
  );
  store.set(overrideImage$, "#000000", "BAD");
  store.set(overrideImage$, "#FFFFFF", "H5");
  expect(store.get(imageSession$)?.overrides).toEqual({ "#000000": "BAD", "#FFFFFF": "H5" });
  expect(store.get(imageSession$)?.error).toContain("Overrides");
  expect(store.set(applyImage$)).toBe(false);
  expect(store.get(editor$).beads).toBe(0);
  store.set(overrideImage$, "#000000", "");
  expect(store.get(imageSession$)?.error).toBe("");
  expect(store.get(imageSession$)?.preview?.mapped.grid).toEqual([["H7", "H5"]]);
  store.set(changeImageSettings$, { columns: 2, rows: 1, alpha: 128, unique: true });
  store.set(updateImage$);
  store.set(overrideImage$, "#000000", "H2");
  store.set(overrideImage$, "#FFFFFF", "H2");
  expect(store.get(imageSession$)?.error).toContain("cannot reuse");
  expect(store.set(applyImage$)).toBe(false);
  store.set(overrideImage$, "#000000", "H7");
  expect(store.get(imageSession$)?.preview?.mapped.grid).toEqual([["H7", "H2"]]);
  expect(store.set(applyImage$)).toBe(true);
});
it("retains conflicting manual choices when settings change and allows correcting them", async () => {
  const store = createStore();
  store.set(newDocument$, 2, 1);
  await store.set(
    loadImage$,
    { name: "Colors.png", read: async () => pixels },
    new AbortController().signal,
  );
  store.set(overrideImage$, "#000000", "B15");
  store.set(overrideImage$, "#FFFFFF", "B15");
  const preview = store.get(imageSession$)?.preview;
  store.set(changeImageSettings$, { columns: 4, rows: 1, alpha: 128, unique: true });
  store.set(updateImage$);
  expect(store.get(imageSession$)?.error).toContain("cannot reuse");
  expect(store.get(imageSession$)?.preview).toBe(preview);
  expect(store.get(imageSession$)?.sample?.grid[0]).toHaveLength(4);
  expect(store.get(imageSession$)?.overrides).toEqual({ "#000000": "B15", "#FFFFFF": "B15" });
  expect(store.set(applyImage$)).toBe(false);
  store.set(overrideImage$, "#FFFFFF", "G14");
  expect(store.get(imageSession$)?.error).toBe("");
  expect(store.set(applyImage$)).toBe(true);
  expect(store.get(editor$).document.grid).toEqual([["B15", "B15", "G14", "G14"]]);
});

it("prunes only source colors absent after successful sampling and keeps choices on invalid input", async () => {
  const store = createStore();
  store.set(newDocument$, 2, 1);
  await store.set(
    loadImage$,
    {
      name: "Alpha.png",
      read: async () => ({ ...pixels, data: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 128]) }),
    },
    new AbortController().signal,
  );
  store.set(overrideImage$, "#000000", "B15");
  store.set(overrideImage$, "#FFFFFF", "G14");
  const preview = store.get(imageSession$)?.preview;
  store.set(changeImageSettings$, { columns: 2, rows: 1, alpha: NaN });
  store.set(updateImage$);
  expect(store.get(imageSession$)?.error).toContain("Alpha threshold");
  expect(store.get(imageSession$)?.preview).toBe(preview);
  expect(store.get(imageSession$)?.overrides).toEqual({ "#000000": "B15", "#FFFFFF": "G14" });
  expect(store.set(applyImage$)).toBe(false);
  store.set(changeImageSettings$, { columns: 2, rows: 1, alpha: 200 });
  store.set(updateImage$);
  expect(store.get(imageSession$)?.overrides).toEqual({ "#000000": "B15" });
  expect(store.get(imageSession$)?.preview?.mapped.grid).toEqual([["B15", null]]);
  store.set(changeImageSettings$, { columns: 1, rows: 1, alpha: 200 });
  store.set(updateImage$);
  expect(store.get(imageSession$)?.overrides).toEqual({});
  expect(store.set(applyImage$)).toBe(true);
  expect(store.get(editor$).document.grid).toEqual([[null]]);
});

it("rejects late decodes after edits, CSV, new images, cancellation or abort", async () => {
  for (const action of ["edit", "csv", "image", "cancel", "abort"] as const) {
    const store = createStore(),
      controller = new AbortController();
    store.set(newDocument$, 2, 1);
    const pending = Promise.withResolvers<RgbaImage>();
    const loading = store
      .set(loadImage$, { name: "old.png", read: () => pending.promise }, controller.signal)
      .catch((error) => error);
    if (action === "edit") {
      store.set(beginStroke$, { x: 0, y: 0 });
      store.set(finishStroke$);
    }
    if (action === "csv")
      await store.set(
        importCsv$,
        { name: "csv.csv", size: 2, text: async () => "H5" },
        controller.signal,
      );
    if (action === "image")
      await store.set(
        loadImage$,
        { name: "new.webp", read: async () => pixels },
        controller.signal,
      );
    if (action === "cancel") store.set(cancelImage$);
    if (action === "abort") controller.abort();
    pending.resolve(pixels);
    await loading;
    if (action === "image") expect(store.get(imageSession$)?.name).toBe("new.webp");
    else expect(store.get(imageSession$)?.preview ?? null).toBeNull();
    expect(store.get(editor$).title).not.toBe("old");
  }
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountApp } from "../src/app.js";
import {
  beginStroke$,
  editor$,
  finishStroke$,
  newDocument$,
  rename$,
  workflow$,
  zoom$,
  type CsvFile,
} from "../src/state.js";
import { DRAFT_KEY, decodeDraft } from "../src/drafts.js";
import * as exporter from "../src/exports.js";
import { loadImage$, imageSession$, applyImage$ } from "../src/image-state.js";
import { selectLocale$ } from "../src/locale.js";

let host: HTMLElement;
let app: ReturnType<typeof mountApp>;
let values: Map<string, string>;
function click(selector: string) {
  host.querySelector<HTMLButtonElement>(selector)!.click();
}
function input(selector: string, value: string) {
  const element = host.querySelector<HTMLInputElement>(selector)!;
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
function importCsv(file: CsvFile) {
  const element = host.querySelector<HTMLInputElement>('[aria-label="Open CSV"]')!;
  Object.defineProperty(element, "files", { configurable: true, value: [file] });
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        expect(this.isConnected).toBe(true);
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
  values = new Map();
  host = document.createElement("div");
  document.body.append(host);
  app = mountApp(host, {
    storage: () => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    }),
  });
});
afterEach(() => {
  app.destroy();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

it("starts with three creation choices, validates dimensions and only saves an explicitly created canvas", async () => {
  expect(host.querySelectorAll(".creation-card")).toHaveLength(3);
  expect(host.querySelector("canvas")).toBeNull();
  expect(host.querySelector(".export-form")).toBeNull();
  await Promise.resolve();
  expect(values.has(DRAFT_KEY)).toBe(false);
  input('[name="columns"]', "0");
  click(".blank-form button");
  expect(host.querySelector('.blank-card [role="alert"]')?.textContent).toContain("integers");
  expect(app.store.get(workflow$).hasDocument).toBe(false);
  input('[name="columns"]', "3");
  input('[name="rows"]', "2");
  click(".blank-form button");
  expect(app.store.get(editor$).document.grid).toEqual([
    [null, null, null],
    [null, null, null],
  ]);
  expect(host.querySelector(".creation-options")).toBeNull();
  expect(host.querySelector(".pattern-canvas")).not.toBeNull();
  await vi.waitFor(() =>
    expect(decodeDraft(values.get(DRAFT_KEY)!).grid).toEqual([
      [null, null, null],
      [null, null, null],
    ]),
  );
});

it("returns from creation with the same document, history, viewport and saved draft", async () => {
  app.store.set(newDocument$, 3, 2);
  app.store.set(rename$, "Keep me");
  app.store.set(beginStroke$, { x: 1, y: 0 });
  app.store.set(finishStroke$);
  app.store.set(zoom$, 2);
  await vi.waitFor(() => expect(values.has(DRAFT_KEY)).toBe(true));
  const before = app.store.get(editor$),
    saved = values.get(DRAFT_KEY);
  click(".document-actions button");
  expect(host.querySelector(".resume-pattern strong")?.textContent).toBe("Keep me");
  expect(host.querySelector("canvas")).toBeNull();
  host
    .querySelector("h1")!
    .dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "z", ctrlKey: true }));
  expect(app.store.get(editor$)).toEqual(before);
  input('[name="columns"]', "257");
  click(".blank-form button");
  expect(app.store.get(workflow$).page).toBe("create");
  expect(app.store.get(editor$).document).toBe(before.document);
  click(".resume-pattern button");
  expect(app.store.get(editor$)).toEqual(before);
  await Promise.resolve();
  expect(values.get(DRAFT_KEY)).toBe(saved);
});

it("imports CSV dimensions and empty borders exactly and refuses approximate colors", async () => {
  input('[name="columns"]', "99");
  input('[name="rows"]', "88");
  importCsv({
    name: "Exact.csv",
    size: 50,
    arrayBuffer: async () =>
      new TextEncoder().encode("\uFEFF,,\r\n#000000,H5,\r\n,ERASE,TRANSPARENT\r\n").buffer,
  });
  await vi.waitFor(() => expect(app.store.get(workflow$).page).toBe("edit"));
  const grid = [
    [null, null, null],
    ["H7", "H5", null],
    [null, null, null],
  ];
  expect(app.store.get(editor$).document.grid).toEqual(grid);
  expect(app.store.get(editor$).title).toBe("Exact");
  click(".document-actions button");
  input('[name="columns"]', "0");
  click(".blank-form button");
  expect(host.querySelector('.blank-card [role="alert"]')?.textContent).toContain("integers");
  importCsv({
    name: "Unknown.csv",
    size: 7,
    arrayBuffer: async () => new TextEncoder().encode("#55514C").buffer,
  });
  await vi.waitFor(() =>
    expect(
      host.querySelector('[aria-labelledby="csv-heading"] [role="alert"]')?.textContent,
    ).toContain("Unknown MARD color"),
  );
  expect(host.querySelectorAll('[role="alert"]')).toHaveLength(1);
  expect(app.store.get(workflow$).page).toBe("create");
  expect(app.store.get(editor$).document.grid).toEqual(grid);
  expect(app.store.get(editor$).title).toBe("Exact");
  click(".resume-pattern button");
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("cancels a pending CSV when continuing the current work and ignores its late result", async () => {
  app.store.set(newDocument$, 2, 1);
  app.store.set(rename$, "Original");
  click(".document-actions button");
  const pending = Promise.withResolvers<ArrayBuffer>();
  importCsv({ name: "Late.csv", size: 2, arrayBuffer: () => pending.promise });
  expect(app.store.get(workflow$).csvLoading).toBe(true);
  click(".resume-pattern button");
  expect(app.store.get(workflow$).csvLoading).toBe(false);
  pending.resolve(new TextEncoder().encode("H7").buffer);
  await pending.promise;
  await Promise.resolve();
  expect(app.store.get(editor$).title).toBe("Original");
  expect(app.store.get(editor$).document.grid).toEqual([[null, null]]);
  expect(host.querySelector(".pattern-canvas")).not.toBeNull();
});

it("lets a newer creation supersede a slow CSV without losing its loading status", async () => {
  const old = Promise.withResolvers<ArrayBuffer>(),
    latest = Promise.withResolvers<ArrayBuffer>();
  importCsv({ name: "Old.csv", size: 2, arrayBuffer: () => old.promise });
  importCsv({ name: "Latest.csv", size: 2, arrayBuffer: () => latest.promise });
  old.resolve(new TextEncoder().encode("H7").buffer);
  await old.promise;
  await Promise.resolve();
  expect(app.store.get(workflow$).csvLoading).toBe(true);
  latest.resolve(new TextEncoder().encode("H2,H5").buffer);
  await vi.waitFor(() => expect(app.store.get(editor$).title).toBe("Latest"));
  expect(app.store.get(editor$).document.grid).toEqual([["H2", "H5"]]);
  expect(app.store.get(workflow$).csvLoading).toBe(false);
});

it("opens export inside the editor, preserves the Canvas and isolates history shortcuts", () => {
  app.store.set(newDocument$, 2, 1);
  app.store.set(beginStroke$, { x: 0, y: 0 });
  app.store.set(finishStroke$);
  const canvas = host.querySelector(".pattern-canvas");
  click('.document-actions [aria-label="Export"]');
  expect(host.querySelector<HTMLDialogElement>(".export-dialog")!.open).toBe(true);
  expect(host.querySelector('[name="scale"]')).toBeNull();
  expect(host.querySelector('[name="width"]')).toBeNull();
  const format = host.querySelector<HTMLButtonElement>('[name="format"]')!;
  format.value = "pixel";
  format.dispatchEvent(new Event("change", { bubbles: true }));
  input('[name="scale"]', "7");
  host
    .querySelector(".export-heading button")!
    .dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "z", ctrlKey: true }));
  expect(app.store.get(editor$).beads).toBe(1);
  click(".export-heading button");
  expect(host.querySelector(".pattern-canvas")).toBe(canvas);
  click('.document-actions [aria-label="Export"]');
  expect(host.querySelector<HTMLInputElement>('[name="scale"]')!.value).toBe("7");
});

it("cancels a closing export, ignores its late result and revokes only completed downloads on teardown", async () => {
  const first = Promise.withResolvers<{ blob: Blob; filename: string }>();
  const second = Promise.withResolvers<{ blob: Blob; filename: string }>();
  const pending = vi
    .spyOn(exporter, "exportPattern")
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:completed");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  click(".blank-form button");
  click('.document-actions [aria-label="Export"]');
  click('.export-form button[type="submit"]');
  expect(host.querySelector<HTMLFieldSetElement>(".export-form fieldset")!.disabled).toBe(true);
  click(".export-heading button");
  expect(pending.mock.calls[0][3].aborted).toBe(true);
  click('.document-actions [aria-label="Export"]');
  click('.export-form button[type="submit"]');
  first.resolve({ blob: new Blob(["old"]), filename: "old.csv" });
  await first.promise;
  await Promise.resolve();
  expect(create).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLFieldSetElement>(".export-form fieldset")!.disabled).toBe(true);
  second.resolve({ blob: new Blob(["new"]), filename: "new.csv" });
  await second.promise;
  await vi.waitFor(() => expect(download).toHaveBeenCalledOnce());
  expect(create).toHaveBeenCalledOnce();
  app.destroy();
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:completed");
});

it("preserves image form drafts within a session and closes and replaces native dialogs between sessions", async () => {
  const show = vi.spyOn(HTMLDialogElement.prototype, "showModal");
  const close = vi.spyOn(HTMLDialogElement.prototype, "close");
  const read = async () => ({ width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255]) });
  const signal = new AbortController().signal;
  await app.store.set(loadImage$, { name: "first.png", read }, signal);
  const first = host.querySelector<HTMLDialogElement>(".image-dialog")!;
  expect(first.querySelector('[name="series"]')).toBeNull();
  input('dialog [name="columns"]', "7");
  input('dialog [name="alpha"]', "64");
  first.querySelector<HTMLInputElement>('[name="unique"]')!.click();
  app.store.set(selectLocale$, "zh-CN");
  expect(first.querySelector<HTMLInputElement>('[name="columns"]')!.value).toBe("7");
  expect(first.querySelector<HTMLInputElement>('[name="alpha"]')!.value).toBe("64");
  expect(first.querySelector('[name="series"]')).toBeNull();
  expect(first.querySelector<HTMLInputElement>('[name="unique"]')!.checked).toBe(true);
  expect(show).toHaveBeenCalledOnce();
  await app.store.set(loadImage$, { name: "second.png", read }, signal);
  const second = host.querySelector<HTMLDialogElement>(".image-dialog")!;
  expect(second).not.toBe(first);
  expect(first.open).toBe(false);
  expect(second.open).toBe(true);
  expect(second.querySelector<HTMLInputElement>('[name="columns"]')!.value).toBe("50");
  expect(second.querySelector<HTMLInputElement>('[name="alpha"]')!.value).toBe("128");
  expect(second.querySelector<HTMLInputElement>('[name="unique"]')!.checked).toBe(false);
  expect(show).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledOnce();
  app.destroy();
  expect(second.open).toBe(false);
  expect(close).toHaveBeenCalledTimes(2);
});

it("coalesces numeric drafts, keeps the old preview and refreshes checkbox changes immediately", async () => {
  const read = async () => ({
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
  });
  await app.store.set(loadImage$, { name: "Colors.png", read }, new AbortController().signal);
  const initial = app.store.get(imageSession$)?.preview;
  const columns = host.querySelector<HTMLInputElement>('dialog [name="columns"]')!;
  columns.focus();
  input('dialog [name="columns"]', "3");
  input('dialog [name="columns"]', "4");
  input('dialog [name="rows"]', "1");
  expect(app.store.get(imageSession$)?.preview).toBe(initial);
  expect(app.store.set(applyImage$)).toBe(false);
  await vi.waitFor(() =>
    expect(app.store.get(imageSession$)?.preview?.mapped.grid).toEqual([["H7", "H7", "H2", "H2"]]),
  );
  expect(document.activeElement).toBe(columns);
  input('dialog [name="alpha"]', "");
  await vi.waitFor(() => expect(app.store.get(imageSession$)?.error).toContain("Alpha threshold"));
  expect(app.store.set(applyImage$)).toBe(false);
  input('dialog [name="alpha"]', "128");
  click('dialog [name="unique"]');
  expect(app.store.get(imageSession$)?.settingsDirty).toBe(false);
  expect(app.store.get(imageSession$)?.error).toBe("");
  expect(app.store.get(imageSession$)?.options.unique).toBe(true);
  input('dialog [name="columns"]', "6");
  columns.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(app.store.get(imageSession$)?.settingsDirty).toBe(false);
  expect(app.store.set(applyImage$)).toBe(true);
  expect(app.store.get(editor$).document.grid).toEqual([["H7", "H7", "H7", "H2", "H2", "H2"]]);
});

it("does not carry scheduled settings across canceled, replaced or destroyed image sessions", async () => {
  const read = async () => ({ width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255]) });
  const signal = new AbortController().signal;
  await app.store.set(loadImage$, { name: "Old.png", read }, signal);
  input('dialog [name="columns"]', "7");
  click(".image-footer button");
  expect(app.store.get(imageSession$)).toBeNull();
  await app.store.set(loadImage$, { name: "Next.png", read }, signal);
  input('dialog [name="columns"]', "9");
  await app.store.set(loadImage$, { name: "Final.png", read }, signal);
  input('dialog [name="columns"]', "3");
  input('dialog [name="rows"]', "1");
  await vi.waitFor(() =>
    expect(app.store.get(imageSession$)?.preview?.mapped.grid).toEqual([["H7", "H7", "H7"]]),
  );
  expect(app.store.get(imageSession$)?.name).toBe("Final.png");
  input('dialog [name="columns"]', "8");
  const previous = app;
  const pending = previous.store.get(imageSession$);
  previous.destroy();
  expect(host.childElementCount).toBe(0);
  app = mountApp(host, {
    storage: () => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    }),
  });
  await app.store.set(loadImage$, { name: "Remounted.png", read }, signal);
  input('dialog [name="columns"]', "2");
  input('dialog [name="rows"]', "1");
  await vi.waitFor(() =>
    expect(app.store.get(imageSession$)?.preview?.mapped.grid).toEqual([["H7", "H7"]]),
  );
  expect(previous.store.get(imageSession$)).toEqual(pending);
});

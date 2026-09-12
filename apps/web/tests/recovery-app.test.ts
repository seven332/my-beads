import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountApp } from "../src/app.js";
import { newDocument$, beginStroke$, finishStroke$, editor$, rename$ } from "../src/state.js";
import { decodeDraft, DRAFT_KEY } from "../src/drafts.js";
import type { RgbaImage } from "@my-beads/core";

let host: HTMLElement;
let app: ReturnType<typeof mountApp>;
let values: Map<string, string>;
const storage = () => ({ getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } });
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  // jsdom lacks native dialog methods; Chromium/WebKit cover actual modal behavior.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
  values = new Map(); host = document.createElement("div"); document.body.append(host);
});
afterEach(() => {
  app?.destroy(); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal"); Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

it("flushes the latest committed edit when destroyed immediately after a command", () => {
  app = mountApp(host, { storage });
  app.store.set(newDocument$, 1, 1);
  app.store.set(beginStroke$, { x: 0, y: 0 }); app.store.set(finishStroke$); app.store.set(rename$, "Latest");
  app.destroy();
  expect(decodeDraft(values.get(DRAFT_KEY)!)).toEqual({ grid: [["H7"]], title: "Latest" });
});

it("persists committed work through the real mount and recovers without live stroke cells", async () => {
  app = mountApp(host, { storage });
  app.store.set(newDocument$, 2, 1); app.store.set(rename$, "My draft");
  await vi.waitFor(() => expect(values.has(DRAFT_KEY)).toBe(true));
  app.store.set(beginStroke$, { x: 0, y: 0 });
  await vi.waitFor(() => expect(host.querySelector('[data-testid="counts"]')?.textContent).toBe("1 beads · 1 colors"));
  expect(decodeDraft(values.get(DRAFT_KEY)!).grid).toEqual([[null, null]]);
  app.store.set(finishStroke$);
  await vi.waitFor(() => expect(decodeDraft(values.get(DRAFT_KEY)!).grid).toEqual([["H7", null]]));
  app.store.set(beginStroke$, { x: 1, y: 0 });
  app.destroy(); app = mountApp(host, { storage });
  expect(app.store.get(editor$).document.grid).toEqual([["H7", null]]);
  expect(app.store.get(editor$).title).toBe("My draft");
  expect(host.querySelector('[aria-label="Draft status"]')?.textContent).toContain("Recovered");
});
it("keeps corrupt drafts on edits and replaces them only through the visible action", async () => {
  values.set(DRAFT_KEY, "broken"); app = mountApp(host, { storage });
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Saving is paused");
  app.store.set(newDocument$, 1, 1);
  app.store.set(beginStroke$, { x: 0, y: 0 }); app.store.set(finishStroke$);
  await vi.waitFor(() => expect(host.querySelector('[data-testid="counts"]')?.textContent).toBe("1 beads · 1 colors"));
  expect(values.get(DRAFT_KEY)).toBe("broken");
  host.querySelector<HTMLButtonElement>(".draft-status button")!.click();
  expect(decodeDraft(values.get(DRAFT_KEY)!).grid).toEqual([["H7"]]);
  expect(host.querySelector('[aria-label="Draft status"]')?.textContent).toContain("saved on this device");
});
it("cancels file work through the real dialog and ignores its late decoder", async () => {
  const pending = Promise.withResolvers<RgbaImage>();
  let signal: AbortSignal | undefined;
  app = mountApp(host, { storage, readImage: (_file, owner) => { signal = owner; return pending.promise; } });
  const input = host.querySelector<HTMLInputElement>('[aria-label="Open image"]')!;
  Object.defineProperty(input, "files", { value: [new File([], "old.png", { type: "image/png" })] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() => expect(host.querySelector("dialog")?.open).toBe(true));
  host.querySelector<HTMLButtonElement>(".image-footer button")!.click();
  expect(signal?.aborted).toBe(true);
  pending.resolve({ width: 1, height: 1, data: new Uint8Array([0, 0, 0, 255]) });
  await pending.promise; await Promise.resolve();
  expect(host.querySelector("dialog")).toBeNull();
  expect(app.store.get(editor$).beads).toBe(0);
  expect(values.has(DRAFT_KEY)).toBe(false);
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountApp } from "../src/app.js";
import {
  beginStroke$,
  chooseColor$,
  newDocument$,
  editor$,
  finishStroke$,
  rename$,
  selectPaletteView$,
  showCreate$,
  showEditor$,
  toggleGrid$,
} from "../src/state.js";

let app: ReturnType<typeof mountApp>;
let host: HTMLElement;
const disconnect = vi.fn();
let storage: Pick<Storage, "getItem" | "setItem">;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect = disconnect;
    },
  );
  const values = new Map<string, string>();
  storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  host = document.createElement("div");
  document.body.append(host);
  app = mountApp(host, { storage: () => storage });
  host.querySelector<HTMLButtonElement>(".blank-form button")!.click();
});
afterEach(() => {
  app.destroy();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

it("boots the real app, updates controls and preserves its Canvas node", async () => {
  await vi.waitFor(() => expect(host.querySelector("canvas")).not.toBeNull());
  const canvas = host.querySelector("canvas");
  const eraser = host.querySelector<HTMLButtonElement>('[aria-label="Eraser"]')!;
  eraser.click();
  await vi.waitFor(() => expect(eraser.getAttribute("aria-pressed")).toBe("true"));
  const search = host.querySelector<HTMLInputElement>('[aria-label="Search colors"]')!;
  search.value = "H7";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  await vi.waitFor(() => expect(host.querySelectorAll("button.color")).toHaveLength(1));
  host.querySelector<HTMLButtonElement>("button.color")!.click();
  expect(host.querySelector("canvas")).toBe(canvas);
  expect(host.querySelector(".selected-color strong")?.textContent).toBe("H7");
  expect(
    host.querySelector('[data-testid="counts"]')?.textContent?.replace(/\s+/g, " ").trim(),
  ).toBe("0 beads · 0 colors");
});

it("shows validation feedback without replacing the current grid", async () => {
  app.store.set(newDocument$, 3, 2);
  app.store.set(newDocument$, 0, 2);
  await vi.waitFor(() =>
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("integers"),
  );
  expect(host.querySelector(".canvas-status")?.textContent).toContain("3 × 2 cells");
});

it("compares source and recommended colors, explains both rules and requires explicit selection", async () => {
  await vi.waitFor(() => expect(host.querySelector("canvas")).not.toBeNull());
  const canvas = host.querySelector("canvas");
  const search = host.querySelector<HTMLInputElement>('[aria-label="Search colors"]')!;
  search.value = "#4c4c40";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  await vi.waitFor(() => expect(host.querySelectorAll(".color-recommendation")).toHaveLength(2));
  expect(host.querySelector(".search-source strong")?.textContent).toBe("#4C4C40");
  expect(
    host.querySelector<HTMLElement>(".search-source .color-swatch")?.style.backgroundColor,
  ).toBe("rgb(76, 76, 64)");
  expect(host.querySelector(".selected-color strong")?.textContent).toBe("H7");
  const closest = host.querySelector<HTMLButtonElement>('[aria-label="H5 #474747"]')!;
  expect(closest.textContent).toContain("Closest color");
  expect(closest.textContent).toContain("including grays");
  const chroma = host.querySelector<HTMLButtonElement>('[aria-label="B23 #303921"]')!;
  expect(chroma.textContent).toContain("Preserve chroma");
  expect(chroma.textContent).toContain("when the input has a tint");
  expect(chroma.getAttribute("aria-describedby")).toBe("palette-rules-B23");
  chroma.click();
  await vi.waitFor(() => expect(chroma.getAttribute("aria-pressed")).toBe("true"));
  expect(host.querySelector(".selected-color strong")?.textContent).toBe("B23");
  expect(
    host.querySelector('[data-testid="counts"]')?.textContent?.replace(/\s+/g, " ").trim(),
  ).toBe("0 beads · 0 colors");
  search.value = "#ff0000";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  await vi.waitFor(() => expect(host.querySelectorAll(".color-recommendation")).toHaveLength(1));
  expect(host.querySelector(".color-recommendation")?.textContent).toContain("Closest color");
  expect(host.querySelector(".color-recommendation")?.textContent).toContain("Preserve chroma");
  search.value = " h7 ";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  await vi.waitFor(() => expect(host.querySelectorAll("button.color")).toHaveLength(1));
  expect(host.querySelector(".color-recommendation")).toBeNull();
  expect(host.querySelector(".search-source")).toBeNull();
  expect(host.querySelector("canvas")).toBe(canvas);
});

it("disconnects Canvas and watcher on destroy and allows independent mounts", async () => {
  await vi.waitFor(() => expect(host.querySelector("canvas")).not.toBeNull());
  const otherHost = document.createElement("div");
  document.body.append(otherHost);
  const other = mountApp(otherHost, { storage: () => storage });
  if (otherHost.querySelector(".blank-form"))
    otherHost.querySelector<HTMLButtonElement>(".blank-form button")!.click();
  try {
    app.store.set(chooseColor$, "H2");
    await vi.waitFor(() =>
      expect(host.querySelector(".selected-color strong")?.textContent).toBe("H2"),
    );
    expect(otherHost.querySelector(".selected-color strong")?.textContent).toBe("H7");
    const canvas = host.querySelector("canvas")!;
    app.destroy();
    app.store.set(chooseColor$, "H5");
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await Promise.resolve();
    expect(host.childElementCount).toBe(0);
    expect(app.store.get(editor$).beads).toBe(0);
    expect(disconnect).toHaveBeenCalled();
    app.store.set(beginStroke$, { x: 0, y: 0 });
    window.dispatchEvent(new Event("blur"));
    expect(app.store.get(editor$).beads).toBe(1);
  } finally {
    other.destroy();
    otherHost.remove();
  }
});

it("keeps controlled text and keyed color buttons synchronized without losing focus", () => {
  const title = host.querySelector<HTMLInputElement>(".title-input")!;
  app.store.set(rename$, "A".repeat(100));
  title.focus();
  title.setSelectionRange(10, 10);
  app.store.set(toggleGrid$);
  expect(document.activeElement).toBe(title);
  expect(title.selectionStart).toBe(10);
  title.value += "overflow";
  title.dispatchEvent(new Event("input", { bubbles: true }));
  expect(title.value).toBe("A".repeat(100));
  app.store.set(chooseColor$, "H7");
  app.store.set(beginStroke$, { x: 1, y: 0 });
  app.store.set(finishStroke$);
  app.store.set(selectPaletteView$, "used");
  const black = host.querySelector<HTMLButtonElement>('.used-color-pick[aria-label="H7 #000000"]')!;
  black.focus();
  app.store.set(chooseColor$, "H2");
  app.store.set(beginStroke$, { x: 0, y: 0 });
  app.store.set(finishStroke$);
  expect(host.querySelectorAll(".used-color-pick")[1]).toBe(black);
  expect(document.activeElement).toBe(black);
  expect(black.querySelector(".used-count")?.textContent).toBe("1 bead");
});

it("releases removed Canvas listeners and cancels an unfinished stroke on app teardown", () => {
  const first = host.querySelector<HTMLCanvasElement>(".pattern-canvas")!;
  expect(first.style.cursor).toContain("data:image/svg+xml,");
  const disconnectedBefore = disconnect.mock.calls.length;
  app.store.set(showCreate$);
  expect(first.style.cursor).toBe("");
  expect(disconnect.mock.calls.length).toBe(disconnectedBefore + 1);
  app.store.set(showEditor$);
  const second = host.querySelector<HTMLCanvasElement>(".pattern-canvas")!;
  expect(second.style.cursor).toContain("data:image/svg+xml,");
  expect(second).not.toBe(first);
  first.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  expect(app.store.get(editor$).beads).toBe(0);
  second.focus();
  second.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  expect(app.store.get(editor$).beads).toBe(1);
  app.store.set(beginStroke$, { x: 1, y: 0 });
  expect(app.store.get(editor$).beads).toBe(2);
  const sibling = document.createElement("span");
  host.append(sibling);
  app.destroy();
  app.destroy();
  expect(second.style.cursor).toBe("");
  expect(app.store.get(editor$).beads).toBe(1);
  expect(disconnect.mock.calls.length).toBe(disconnectedBefore + 2);
  expect(host.children).toHaveLength(1);
  expect(host.firstElementChild).toBe(sibling);
  second.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
  second.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  expect(app.store.get(editor$).beads).toBe(1);
});

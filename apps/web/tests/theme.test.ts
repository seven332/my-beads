import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createStore } from "ccstate";
import { mountApp } from "../src/app.js";
import { mountTheme } from "../src/theme-browser.js";
import { readThemePreference, resolveTheme, THEME_KEY } from "../src/theme-preference.js";
import { selectTheme$, systemThemeChanged$, theme$, themePreference$ } from "../src/theme-state.js";
import {
  beginStroke$,
  editor$,
  finishStroke$,
  newDocument$,
  rename$,
  undo$,
  zoom$,
} from "../src/state.js";
import { openExport$, selectExportFormat$, changeExportSize$ } from "../src/export-state.js";
import { selectLocale$ } from "../src/locale.js";
import { DRAFT_KEY } from "../src/drafts.js";

function systemMedia(dark = false) {
  const media = Object.assign(new EventTarget(), {
    matches: dark,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addListener() {},
    removeListener() {},
  });
  const matchMedia = window.matchMedia.bind(window);
  vi.spyOn(window, "matchMedia").mockImplementation((query) =>
    query === media.media ? media : matchMedia(query),
  );
  return {
    media,
    change(value: boolean) {
      media.matches = value;
      media.dispatchEvent(new Event("change"));
    },
  };
}
const mounts: ReturnType<typeof mountApp>[] = [];
const hosts: HTMLElement[] = [];
function host() {
  const node = document.createElement("div");
  document.body.append(node);
  hosts.push(node);
  return node;
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
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {},
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() {} });
});
afterEach(() => {
  for (const app of mounts.splice(0)) app.destroy();
  for (const node of hosts.splice(0)) node.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

it("resolves saved choices strictly and lets explicit choices override the system", () => {
  for (const saved of [null, "invalid", "Dark", "", "system"]) {
    const preference = readThemePreference(() => ({ getItem: () => saved }));
    expect(preference).toBe("system");
    expect(resolveTheme(preference, true)).toBe("dark");
    expect(resolveTheme(preference, false)).toBe("light");
  }
  for (const saved of ["light", "dark"] as const) {
    expect(readThemePreference(() => ({ getItem: () => saved }))).toBe(saved);
    expect(resolveTheme(saved, true)).toBe(saved);
    expect(resolveTheme(saved, false)).toBe(saved);
  }
  expect(
    readThemePreference(() => {
      throw new Error("Denied");
    }),
  ).toBe("system");
});

it("keeps preference and effective theme separate and isolated across stores", () => {
  const one = createStore(),
    two = createStore();
  one.set(systemThemeChanged$, true);
  expect(one.get(themePreference$)).toBe("system");
  expect(one.get(theme$)).toBe("dark");
  one.set(selectTheme$, "light");
  expect(one.get(theme$)).toBe("light");
  expect(two.get(theme$)).toBe("light");
  one.set(selectTheme$, "system");
  expect(one.get(theme$)).toBe("dark");
});

it("owns its system listener and restores only its theme root on teardown", () => {
  const system = systemMedia(true),
    node = host(),
    changed = vi.fn();
  node.dataset.theme = "light";
  node.style.colorScheme = "light";
  const before = document.documentElement.getAttribute("data-theme");
  const adapter = mountTheme(node, () => ({ getItem: () => null, setItem() {} }), changed);
  expect(adapter.systemDark).toBe(true);
  adapter.sync("dark");
  expect(node.dataset.theme).toBe("dark");
  expect(node.style.colorScheme).toBe("dark");
  expect(document.documentElement.getAttribute("data-theme")).toBe(before);
  system.change(false);
  expect(changed).toHaveBeenCalledExactlyOnceWith(false);
  adapter.destroy();
  expect(node.dataset.theme).toBe("light");
  expect(node.style.colorScheme).toBe("light");
  system.change(true);
  expect(changed).toHaveBeenCalledTimes(1);
});

it("persists translated selections and preserves Canvas, draft, history and unfinished export settings", async () => {
  const system = systemMedia(),
    node = host();
  const values = new Map<string, string>();
  const storage = () => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  });
  const app = mountApp(node, { storage });
  mounts.push(app);
  app.store.set(newDocument$, 3, 2);
  app.store.set(rename$, "Original");
  app.store.set(beginStroke$, { x: 0, y: 0 });
  app.store.set(finishStroke$);
  app.store.set(zoom$, 2);
  await vi.waitFor(() => expect(values.has(DRAFT_KEY)).toBe(true));
  const before = app.store.get(editor$),
    draft = values.get(DRAFT_KEY),
    canvas = node.querySelector("canvas");
  app.store.set(openExport$);
  app.store.set(selectExportFormat$, "pixel");
  app.store.set(changeExportSize$, "scale", "7");
  system.change(true);
  expect(node.dataset.theme).toBe("dark");
  expect(node.querySelector("canvas")).toBe(canvas);
  expect(app.store.get(editor$)).toBe(before);
  expect(node.querySelector<HTMLInputElement>('[name="scale"]')!.value).toBe("7");
  expect(values.get(DRAFT_KEY)).toBe(draft);
  app.store.set(selectLocale$, "zh-CN");
  const select = node.querySelector<HTMLSelectElement>('[aria-label="外观"]')!;
  expect([...select.options].map((option) => option.text)).toEqual(["跟随系统", "浅色", "深色"]);
  select.value = "light";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  expect(values.get(THEME_KEY)).toBe("light");
  expect(node.dataset.theme).toBe("light");
  expect(node.querySelector(".appearance-picker")?.getAttribute("title")).toBe("外观：浅色");
  const other = host(),
    reloaded = mountApp(other, { storage });
  mounts.push(reloaded);
  expect(other.dataset.theme).toBe("light");
  expect(other.querySelector<HTMLSelectElement>(".appearance-picker select")!.value).toBe("light");
  app.store.set(selectTheme$, "dark");
  expect(node.dataset.theme).toBe("dark");
  expect(other.dataset.theme).toBe("light");
  app.store.set(undo$);
  expect(app.store.get(editor$).beads).toBe(0);
});

it("keeps theme switching and editing usable when storage reads and writes are denied", () => {
  const system = systemMedia(true),
    node = host();
  const app = mountApp(node, {
    storage: () => {
      throw new Error("Denied");
    },
  });
  mounts.push(app);
  expect(node.dataset.theme).toBe("dark");
  const select = node.querySelector<HTMLSelectElement>('[aria-label="Appearance"]')!;
  select.value = "light";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  expect(node.dataset.theme).toBe("light");
  system.change(false);
  system.change(true);
  expect(node.dataset.theme).toBe("light");
  node.querySelector<HTMLButtonElement>(".blank-form button")!.click();
  app.store.set(beginStroke$, { x: 0, y: 0 });
  app.store.set(finishStroke$);
  expect(app.store.get(editor$).beads).toBe(1);
});

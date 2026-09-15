import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createStore } from "ccstate";
import { checkCatalogs } from "../scripts/check-i18n.js";
import { mountApp } from "../src/app.js";
import { LOCALE_KEY, resolveLocale, translator, type Locale } from "../src/i18n/index.js";
import { locale$, selectLocale$ } from "../src/locale.js";
import {
  beginStroke$,
  editor$,
  finishStroke$,
  importCsv$,
  newDocument$,
  rename$,
  undo$,
  zoom$,
} from "../src/state.js";
import { loadImage$, imageSession$, updateImage$ } from "../src/image-state.js";
import { DRAFT_KEY, type DraftStorage } from "../src/drafts.js";
import {
  openExport$,
  selectExportFormat$,
  changeExportSize$,
  exportSettings$,
} from "../src/export-state.js";

const mounts: { app: ReturnType<typeof mountApp>; host: HTMLElement }[] = [];
function mount(storage: () => DraftStorage) {
  const host = document.createElement("div");
  document.body.append(host);
  const app = mountApp(host, { storage });
  mounts.push({ app, host });
  return { app, host };
}
async function switchLanguage(host: HTMLElement, locale: Locale) {
  const select = host.querySelector<HTMLButtonElement>(".language-picker .select-trigger")!;
  select.value = locale;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() =>
    expect(host.querySelector(".brand")?.textContent).toContain(
      locale === "zh-CN" ? "我来拼豆" : "My Beads",
    ),
  );
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
  // jsdom does not implement the native dialog methods; real behavior is covered in E2E.
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {},
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() {} });
});
afterEach(() => {
  for (const { app, host } of mounts.splice(0)) {
    app.destroy();
    host.remove();
  }
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  document.documentElement.lang = "en";
});

it("uses a valid saved choice, then the first supported browser language, then English", () => {
  expect(resolveLocale("en-US", ["zh-CN"])).toBe("en-US");
  expect(resolveLocale("zh-CN", ["en-US"])).toBe("zh-CN");
  expect(resolveLocale("invalid", ["fr", "zh-Hans", "en-US"])).toBe("zh-CN");
  expect(resolveLocale(null, ["en-GB", "zh-CN"])).toBe("en-US");
  expect(resolveLocale(null, ["zh-TW"])).toBe("zh-CN");
  expect(resolveLocale(null, ["ja", "de"])).toBe("en-US");
  expect(resolveLocale(null, [])).toBe("en-US");
});

it("formats counts with the locale's plural and number rules without changing other translators", () => {
  const en = translator("en-US"),
    zh = translator("zh-CN");
  expect(en(($) => $.beads, { count: 1 })).toBe("1 bead");
  expect(zh(($) => $.beads, { count: 1 })).toBe("1 颗");
  expect(en(($) => $.beads, { count: 1200 })).toBe("1,200 beads");
  expect(zh(($) => $.beads, { count: 1200 })).toBe("1,200 颗");
  expect(en(($) => $.palette.suggestions, { count: 2 })).toBe("No exact match · 2 suggestions");
  expect(zh(($) => $.palette.suggestions, { count: 1 })).toBe("无精确匹配 · 1 个推荐");
  expect(en(($) => $.app.name)).toBe("My Beads");
});

it("rejects missing, extra, empty and mismatched translations while respecting Chinese plurals", () => {
  const source = {
    label: "Map {{source}}",
    beads_one: "{{count}} bead",
    beads_other: "{{count}} beads",
  };
  const valid = { label: "映射 {{source}}", beads_other: "{{count}} 颗" };
  expect(() => checkCatalogs(source, valid, "zh-CN")).not.toThrow();
  expect(() => checkCatalogs(source, { ...valid, label: "映射 {{code}}" }, "zh-CN")).toThrow(
    "placeholders",
  );
  expect(() => checkCatalogs(source, { ...valid, extra: "多余" }, "zh-CN")).toThrow("Unexpected");
  expect(() => checkCatalogs(source, { label: valid.label }, "zh-CN")).toThrow("Missing");
  expect(() => checkCatalogs(source, { ...valid, label: " " }, "zh-CN")).toThrow("nonempty");
  expect(() =>
    checkCatalogs(source, { label: valid.label, beads_one: "{{count}} 颗" }, "zh-CN"),
  ).toThrow("Missing");
});

it("switches the mounted UI and remembers the choice without changing the draft, history, Canvas or form settings", async () => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["zh-CN"]);
  const values = new Map<string, string>([[LOCALE_KEY, "en-US"]]);
  const storage = () => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  });
  const { app, host } = mount(storage);
  app.store.set(newDocument$, 3, 2);
  app.store.set(rename$, "My pattern 原图");
  app.store.set(beginStroke$, { x: 0, y: 0 });
  app.store.set(finishStroke$);
  app.store.set(zoom$, 2);
  await vi.waitFor(() =>
    expect(host.querySelector(".counts")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "1 bead · 1 color",
    ),
  );
  const before = app.store.get(editor$),
    saved = values.get(DRAFT_KEY),
    canvas = host.querySelector("canvas");
  app.store.set(openExport$);
  app.store.set(selectExportFormat$, "pixel");
  app.store.set(changeExportSize$, "scale", "7");
  await switchLanguage(host, "zh-CN");
  expect(document.documentElement.lang).toBe("zh-CN");
  expect(document.title).toBe("我来拼豆 — 拼豆图纸编辑器");
  expect(host.querySelector('[aria-label="橡皮擦"]')).not.toBeNull();
  expect(host.querySelector(".counts")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
    "1 颗 · 1 色",
  );
  expect(host.querySelector("canvas")).toBe(canvas);
  expect(app.store.get(editor$)).toEqual(before);
  expect(host.querySelector<HTMLInputElement>('[name="scale"]')!.value).toBe("7");
  expect(host.querySelector<HTMLButtonElement>('[name="format"]')!.value).toBe("pixel");
  expect(app.store.get(exportSettings$).scale).toBe("7");
  expect(values.get(DRAFT_KEY)).toBe(saved);
  expect(values.get(LOCALE_KEY)).toBe("zh-CN");
  app.store.set(undo$);
  expect(app.store.get(editor$).beads).toBe(0);
  const reloaded = mount(storage);
  expect(reloaded.app.store.get(locale$)).toBe("zh-CN");
  expect(
    reloaded.host.querySelector<HTMLButtonElement>(".language-picker .select-trigger")!.value,
  ).toBe("zh-CN");
  await switchLanguage(host, "en-US");
  expect(reloaded.app.store.get(locale$)).toBe("zh-CN");
});

it("uses the browser language and keeps editing usable when preference storage is unavailable", async () => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["zh-CN"]);
  const { app, host } = mount(() => {
    throw new Error("Denied");
  });
  expect(app.store.get(locale$)).toBe("zh-CN");
  expect(host.querySelector<HTMLButtonElement>(".language-picker .select-trigger")!.value).toBe(
    "zh-CN",
  );
  await switchLanguage(host, "en-US");
  host.querySelector<HTMLButtonElement>(".blank-form button")!.click();
  app.store.set(beginStroke$, { x: 0, y: 0 });
  app.store.set(finishStroke$);
  expect(app.store.get(editor$).beads).toBe(1);
  expect(host.querySelector(".draft-status")?.textContent).toContain("Denied");
});

it("retranslates existing validation errors and protects a corrupt draft during language changes", async () => {
  const values = new Map([[DRAFT_KEY, '{"version":99}']]);
  const { app, host } = mount(() => ({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  }));
  const text = "H7,H2\nH5";
  await app.store.set(
    importCsv$,
    { name: "invalid.csv", size: text.length, text: async () => text },
    new AbortController().signal,
  );
  expect(app.store.get(editor$).error).toBe("CSV row 2 has 1 columns; expected 2");
  await switchLanguage(host, "zh-CN");
  expect(app.store.get(editor$).error).toBe("CSV 第 2 行有 1 列，应为 2 列");
  expect(host.querySelector(".draft-status")?.textContent).toContain("不支持此草稿版本");
  expect(values.get(DRAFT_KEY)).toBe('{"version":99}');
});

it("updates an open image dialog without discarding its preview or unfinished settings", async () => {
  const { app, host } = mount(() => ({ getItem: () => null, setItem: () => {} }));
  await app.store.set(
    loadImage$,
    {
      name: "original.png",
      read: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255]) }),
    },
    new AbortController().signal,
  );
  await vi.waitFor(() => expect(host.querySelector("dialog")).not.toBeNull());
  const before = app.store.get(imageSession$),
    dialog = host.querySelector("dialog");
  const columns = dialog!.querySelector<HTMLInputElement>('[name="columns"]')!;
  columns.value = "7";
  columns.dispatchEvent(new Event("input", { bubbles: true }));
  app.store.set(selectLocale$, "zh-CN");
  await vi.waitFor(() => expect(dialog!.textContent).toContain("导入像素图"));
  expect(host.querySelector("dialog")).toBe(dialog);
  expect(columns.value).toBe("7");
  expect(app.store.get(imageSession$)?.mapped).toBe(before?.mapped);
  expect(app.store.get(imageSession$)?.settingsDirty).toBe(true);
  app.store.set(updateImage$, { ...before!.options, columns: 0 });
  expect(app.store.get(imageSession$)?.error).toContain("目标网格行列数");
  app.store.set(selectLocale$, "en-US");
  expect(app.store.get(imageSession$)?.error).toContain("Target grid dimensions");
});

it("keeps locale-dependent errors isolated between stores", () => {
  const chinese = createStore(),
    english = createStore();
  chinese.set(selectLocale$, "zh-CN");
  chinese.set(newDocument$, 0, 1);
  english.set(newDocument$, 0, 1);
  expect(chinese.get(editor$).error).toBe("网格行列数必须是 1 到 256 的整数。");
  expect(english.get(editor$).error).toContain("integers from 1 to 256");
});

it("does not confuse non-Error rejections with cleared alerts", async () => {
  const store = createStore();
  store.set(selectLocale$, "zh-CN");
  const signal = new AbortController().signal;
  await store.set(
    importCsv$,
    { name: "unreadable.csv", size: 0, text: () => Promise.reject(null) },
    signal,
  );
  expect(store.get(editor$).error).toBe("操作失败：null");
  await store.set(
    loadImage$,
    { name: "unreadable.png", read: () => Promise.reject(undefined) },
    signal,
  );
  expect(store.get(imageSession$)?.error).toBe("操作失败：undefined");
});

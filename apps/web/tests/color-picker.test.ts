import { afterEach, expect, it, vi } from "vitest";
import { createStore } from "ccstate";
import { defaultPalette } from "@my-beads/core";
import { hexToHsv, hsvToHex, hsvToHsl, hslToHsv } from "../src/color-picker.js";
import {
  colorPicker$,
  paletteQuery$,
  paletteSearch$,
  searchPalette$,
  showColorPicker$,
  selectColorFormat$,
  pickColor$,
  editColorChannel$,
  commitColorChannel$,
} from "../src/palette-state.js";
import { mountApp } from "../src/app.js";
import {
  editor$,
  documentRevision$,
  newDocument$,
  beginStroke$,
  finishStroke$,
  selectPaletteView$,
  showPalette$,
  showCreate$,
  showEditor$,
  undo$,
} from "../src/state.js";
import { selectLocale$ } from "../src/locale.js";
import { selectTheme$ } from "../src/theme-state.js";
import { DRAFT_KEY } from "../src/drafts.js";

it("round-trips every MARD color and known RGB/HSV boundaries", () => {
  for (const hex of Object.values(defaultPalette.colors)) expect(hsvToHex(hexToHsv(hex))).toBe(hex);
  for (const hex of Object.values(defaultPalette.colors))
    expect(hsvToHex(hslToHsv(hsvToHsl(hexToHsv(hex))))).toBe(hex);
  const hsl = hsvToHsl(hexToHsv("#336699"));
  expect(hsl.hue).toBe(210);
  expect(hsl.saturation).toBeCloseTo(50, 10);
  expect(hsl.lightness).toBe(40);
  for (const [hue, hex] of [
    [0, "#FF0000"],
    [60, "#FFFF00"],
    [120, "#00FF00"],
    [180, "#00FFFF"],
    [240, "#0000FF"],
    [300, "#FF00FF"],
    [360, "#FF0000"],
  ] as const) {
    expect(hsvToHex({ hue, saturation: 100, brightness: 100 })).toBe(hex);
  }
  expect(hsvToHex({ hue: 240, saturation: 50, brightness: 50 })).toBe("#404080");
  expect(hsvToHex(hexToHsv("#abc"))).toBe("#AABBCC");
});

it("preserves hue through gray/white and saturation through black", () => {
  const green = { hue: 120, saturation: 75, brightness: 80 };
  expect(hexToHsv("#808080", green)).toEqual({
    hue: 120,
    saturation: 0,
    brightness: (128 / 255) * 100,
  });
  expect(hexToHsv("#FFFFFF", green)).toEqual({ hue: 120, saturation: 0, brightness: 100 });
  expect(hexToHsv("#000000", green)).toEqual({ ...green, brightness: 0 });
});

it("synchronizes exact codes and HEX without consuming partial text or changing code precedence", () => {
  const store = createStore();
  store.set(searchPalette$, "B23");
  expect(store.get(colorPicker$).color?.hex).toBe("#303921");
  expect(store.get(paletteSearch$).colors[0].code).toBe("B23");
  store.set(searchPalette$, "#b23");
  expect(store.get(colorPicker$).color?.hex).toBe("#BB2233");
  const color = store.get(colorPicker$).color;
  store.set(searchPalette$, "#12");
  expect(store.get(paletteQuery$)).toBe("#12");
  expect(store.get(colorPicker$).color).toEqual(color);
  store.set(showColorPicker$, true, "#FFFFFF");
  expect(store.get(colorPicker$).color?.hex).toBe("#BB2233");
});

it("retains HSV intent even when rounded HEX stays black and clamps graphical coordinates", () => {
  const store = createStore();
  store.set(showColorPicker$, true);
  store.set(pickColor$, { hue: 240, saturation: 73.123, brightness: 0 });
  expect(store.get(paletteQuery$)).toBe("#000000");
  expect(store.get(colorPicker$).color?.hsv).toEqual({
    hue: 240,
    saturation: 73.123,
    brightness: 0,
  });
  store.set(pickColor$, { brightness: 100 });
  expect(store.get(paletteQuery$)).toBe("#4545FF");
  store.set(pickColor$, { saturation: 150, brightness: -10, hue: 400 });
  expect(store.get(colorPicker$).color?.hsv).toEqual({ hue: 360, saturation: 100, brightness: 0 });
  const before = store.get(colorPicker$);
  store.set(pickColor$, { hue: NaN });
  expect(store.get(colorPicker$)).toBe(before);
});

it("keeps unfinished/invalid numeric text until commit and isolates independent stores", () => {
  const store = createStore(),
    other = createStore();
  store.set(showColorPicker$, true, "#FF0000");
  store.set(selectColorFormat$, "hsb");
  store.set(editColorChannel$, "hue", "120.0");
  expect(store.get(paletteQuery$)).toBe("#00FF00");
  expect(store.get(colorPicker$).color?.fields.hue).toBe("120.0");
  for (const text of ["", "361", "-1", "Infinity"]) {
    store.set(editColorChannel$, "hue", text);
    expect(store.get(colorPicker$).color?.fields.hue).toBe(text);
    expect(store.get(paletteQuery$)).toBe("#00FF00");
    store.set(commitColorChannel$, "hue", "hsb");
    expect(store.get(colorPicker$).color?.fields.hue).toBe("120");
  }
  expect(other.get(colorPicker$)).toEqual({ open: false, format: "hex", color: null });
  expect(other.get(paletteQuery$)).toBe("");
});

it("switches formats without changing the target, matching results or high-precision coordinates", () => {
  const store = createStore();
  store.set(showColorPicker$, true);
  expect(store.get(colorPicker$).format).toBe("hex");
  store.set(pickColor$, { hue: 210.123456, saturation: 66.654321, brightness: 59.987654 });
  const before = store.get(colorPicker$).color!;
  const query = store.get(paletteQuery$);
  const results = store.get(paletteSearch$);
  for (let i = 0; i < 10; i++) {
    for (const format of ["rgb", "hsl", "hsb", "hex"] as const) {
      store.set(selectColorFormat$, format);
      expect(store.get(colorPicker$).color?.hsv).toBe(before.hsv);
      expect(store.get(colorPicker$).color?.hex).toBe(before.hex);
      expect(store.get(paletteQuery$)).toBe(query);
      expect(store.get(paletteSearch$)).toBe(results);
    }
  }
});

it("treats HEX fields as colors and validates HEX/RGB edits before updating the target", () => {
  const store = createStore();
  store.set(showColorPicker$, true);
  store.set(editColorChannel$, "hex", "B23");
  expect(store.get(paletteQuery$)).toBe("#BB2233");
  for (const text of ["", "#12", "#11223344", "red", "#GGGGGG"]) {
    store.set(editColorChannel$, "hex", text);
    expect(store.get(colorPicker$).color?.fields.hex).toBe(text);
    expect(store.get(paletteQuery$)).toBe("#BB2233");
    store.set(commitColorChannel$, "hex", "hex");
    expect(store.get(colorPicker$).color?.fields.hex).toBe("#BB2233");
  }
  store.set(searchPalette$, "B23");
  expect(store.get(colorPicker$).color?.hex).toBe("#303921");
  store.set(searchPalette$, "#336699");
  store.set(selectColorFormat$, "rgb");
  expect(store.get(colorPicker$).color?.fields).toMatchObject({
    red: "51",
    green: "102",
    blue: "153",
  });
  for (const text of ["", "-1", "256", "128.5", "NaN"]) {
    store.set(editColorChannel$, "red", text);
    expect(store.get(paletteQuery$)).toBe("#336699");
    store.set(commitColorChannel$, "red", "rgb");
    expect(store.get(colorPicker$).color?.fields.red).toBe("51");
  }
  store.set(editColorChannel$, "red", "255");
  expect(store.get(paletteQuery$)).toBe("#FF6699");
  store.set(editColorChannel$, "red", "0");
  expect(store.get(paletteQuery$)).toBe("#006699");
});

it("preserves HSL saturation intent at white and black across mode changes", () => {
  const store = createStore();
  store.set(showColorPicker$, true, "#00FF00");
  store.set(selectColorFormat$, "hsl");
  store.set(editColorChannel$, "lightness", "100");
  expect(store.get(paletteQuery$)).toBe("#FFFFFF");
  store.set(editColorChannel$, "saturation", "60");
  store.set(selectColorFormat$, "rgb");
  store.set(selectColorFormat$, "hsl");
  expect(store.get(colorPicker$).color?.fields.saturation).toBe("60");
  store.set(editColorChannel$, "lightness", "50");
  expect(store.get(paletteQuery$)).toBe("#33CC33");
  store.set(editColorChannel$, "lightness", "0");
  expect(store.get(paletteQuery$)).toBe("#000000");
  store.set(selectColorFormat$, "hsb");
  store.set(selectColorFormat$, "hsl");
  expect(store.get(colorPicker$).color?.fields.saturation).toBe("60");
  store.set(editColorChannel$, "lightness", "50");
  expect(store.get(paletteQuery$)).toBe("#33CC33");
});

let app: ReturnType<typeof mountApp> | undefined;
let host: HTMLElement | undefined;
function mounted() {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const values = new Map<string, string>();
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
  app.store.set(newDocument$, 2, 1);
  return { app, host, values };
}
afterEach(() => {
  app?.destroy();
  host?.remove();
  app = undefined;
  host = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function input(element: HTMLInputElement, value: string) {
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

it("preserves Canvas, data, history, draft and viewport while exploring; only a result changes the brush", async () => {
  const { app, host, values } = mounted();
  app.store.set(beginStroke$, { x: 0, y: 0 });
  app.store.set(finishStroke$);
  await vi.waitFor(() => expect(values.has(DRAFT_KEY)).toBe(true));
  const before = app.store.get(editor$),
    revision = app.store.get(documentRevision$),
    draft = values.get(DRAFT_KEY);
  const canvas = host.querySelector("canvas");
  const toggle = host.querySelector<HTMLButtonElement>(".color-picker-toggle")!;
  toggle.click();
  expect(document.activeElement).toBe(host.querySelector(".color-hue"));
  input(host.querySelector<HTMLInputElement>(".palette-search")!, "#4c4c40");
  expect(host.querySelectorAll(".color-recommendation")).toHaveLength(2);
  expect(host.querySelector(".search-source strong")?.textContent).toBe("#4C4C40");
  const after = app.store.get(editor$);
  expect(after.document).toBe(before.document);
  expect(after.viewport).toBe(before.viewport);
  expect(after.color).toBe(before.color);
  expect(app.store.get(documentRevision$)).toBe(revision);
  expect(values.get(DRAFT_KEY)).toBe(draft);
  expect(host.querySelector("canvas")).toBe(canvas);
  host.querySelector<HTMLButtonElement>('[aria-label="B23 #303921"]')!.click();
  expect(app.store.get(editor$).color).toBe("B23");
  app.store.set(undo$);
  expect(app.store.get(editor$).beads).toBe(0);
});

it("preserves unfinished fields and the pointer area across theme/locale renders, then restores focus on Escape", () => {
  const { app, host } = mounted();
  host.querySelector<HTMLButtonElement>(".color-picker-toggle")!.click();
  app.store.set(selectColorFormat$, "hsb");
  const area = host.querySelector(".color-area");
  const saturation = host.querySelector<HTMLInputElement>('[aria-label="Saturation (%)"]')!;
  saturation.focus();
  input(saturation, "");
  app.store.set(selectTheme$, "dark");
  app.store.set(selectLocale$, "zh-CN");
  expect(host.querySelector(".color-area")).toBe(area);
  expect(saturation.value).toBe("");
  expect(document.activeElement).toBe(saturation);
  expect(saturation.getAttribute("aria-label")).toBe("饱和度（%）");
  saturation.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
  expect(host.querySelector(".color-area")).toBeNull();
  expect(document.activeElement).toBe(host.querySelector(".color-picker-toggle"));
});

it("closes the picker when leaving its palette view or navigating, and keeps its target on return", () => {
  const { app } = mounted();
  app.store.set(searchPalette$, "#ff0000");
  for (const close of [
    () => app.store.set(selectPaletteView$, "used"),
    () => app.store.set(showPalette$, false),
    () => app.store.set(showCreate$),
  ]) {
    app.store.set(selectPaletteView$, "all");
    app.store.set(showColorPicker$, true);
    close();
    expect(app.store.get(colorPicker$).open).toBe(false);
    expect(app.store.get(paletteQuery$)).toBe("#ff0000");
  }
  app.store.set(showEditor$);
  app.store.set(showColorPicker$, true);
  expect(app.store.get(colorPicker$).color?.hex).toBe("#FF0000");
});

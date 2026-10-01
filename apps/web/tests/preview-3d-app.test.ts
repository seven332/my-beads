import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountApp } from "../src/app.js";
import {
  beginStroke$,
  editor$,
  newDocument$,
  undo$,
  redo$,
  chooseTool$,
  chooseColor$,
  moveViewport$,
} from "../src/state.js";
import { previewSession$ } from "../src/preview-3d-state.js";
import { selectLocale$ } from "../src/locale.js";
import { DRAFT_KEY } from "../src/drafts.js";
import type { PreviewLoader } from "../src/preview-3d-controller.js";

let app: ReturnType<typeof mountApp>;
let host: HTMLElement;
let values: Map<string, string>;
const gpu = {
  theme: vi.fn(),
  action: vi.fn(),
  destroy: vi.fn(),
  shadows: vi.fn(),
  shadowsAvailable: true,
};
const load = vi.fn<PreviewLoader>(async () => ({
  mountPreview3D: vi.fn((_canvas, _grid, _theme, report) => {
    report("ready");
    return gpu;
  }),
}));
function click(selector: string) {
  host.querySelector<HTMLButtonElement>(selector)!.click();
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
    loadPreview: load,
  });
  app.store.set(newDocument$, 3, 2);
});
afterEach(() => {
  app.destroy();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

it("loads only on demand, isolates camera/shortcuts/drafts, restores focus and reopens current edits", async () => {
  expect(load).not.toHaveBeenCalled();
  const canvas = host.querySelector(".pattern-canvas");
  app.store.set(beginStroke$, { x: 0, y: 0 });
  click(".preview-open");
  await vi.waitFor(() => expect(app.store.get(previewSession$)?.status).toBe("ready"));
  expect(app.store.get(editor$).canUndo).toBe(true);
  const before = app.store.get(editor$);
  const draft = values.get(DRAFT_KEY);
  click('.preview-controls [aria-label="Cast shadows"]');
  expect(gpu.shadows).toHaveBeenCalledWith(true);
  expect(host.querySelector('[aria-label="Cast shadows"]')?.getAttribute("aria-pressed")).toBe(
    "true",
  );
  click('.preview-controls [aria-label="Rotate left"]');
  const close = host.querySelector<HTMLButtonElement>('[aria-label="Close 3D preview"]')!;
  close.focus();
  for (const key of ["e", "g", " ", "z"])
    close.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: key === "z", bubbles: true }));
  app.store.set(selectLocale$, "zh-CN");
  expect(host.querySelector('[aria-label="投影"]')?.getAttribute("aria-pressed")).toBe("true");
  expect(host.querySelector(".preview-footer")?.textContent).toContain("未熨烫");
  click('[aria-label="关闭 3D 预览"]');
  expect(host.querySelector(".pattern-canvas")).toBe(canvas);
  expect(document.activeElement).toBe(host.querySelector(".preview-open"));
  expect(app.store.get(editor$).document).toBe(before.document);
  expect(app.store.get(editor$).tool).toBe(before.tool);
  expect(values.get(DRAFT_KEY)).toBe(draft);
  expect(gpu.action).toHaveBeenCalledWith("left");
  expect(gpu.destroy).toHaveBeenCalledOnce();
  app.store.set(undo$);
  expect(app.store.get(editor$).beads).toBe(0);
  app.store.set(redo$);
  app.store.set(chooseTool$, "eraser");
  app.store.set(chooseColor$, "B15");
  app.store.set(moveViewport$, 12, -18);
  const preserved = app.store.get(editor$);
  click(".preview-open");
  expect(app.store.get(previewSession$)?.beads).toBe(1);
  host.querySelector(".preview-dialog")!.dispatchEvent(new Event("cancel", { cancelable: true }));
  expect(app.store.get(editor$)).toBe(preserved);
});

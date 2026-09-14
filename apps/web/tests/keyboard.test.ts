import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountApp } from "../src/app.js";
import {
  editor$,
  newDocument$,
  showCreate$,
  showEditor$,
  beginStroke$,
  finishStroke$,
  highlightColor$,
  chooseTool$,
} from "../src/state.js";
import { selectLocale$ } from "../src/locale.js";

let host: HTMLElement;
let app: ReturnType<typeof mountApp>;
function press(target: EventTarget, key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
}
function canvas() {
  return host.querySelector<HTMLCanvasElement>("canvas")!;
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
  host = document.createElement("div");
  document.body.append(host);
  app = mountApp(host, { storage: () => ({ getItem: () => null, setItem() {} }) });
  app.store.set(newDocument$, 3, 1);
  canvas().focus();
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

it("keeps native editing, modifiers, composition and repeat from dispatching discrete shortcuts", () => {
  const input = host.querySelector<HTMLInputElement>(".title-input")!;
  input.focus();
  for (const key of ["e", "g", "?", " ", "z"]) {
    expect(press(input, key).defaultPrevented).toBe(false);
  }
  canvas().focus();
  for (const options of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { isComposing: true },
    { keyCode: 229 },
    { repeat: true },
  ])
    press(canvas(), "e", options);
  expect(app.store.get(editor$).tool).toBe("pencil");
  canvas().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  expect(press(canvas(), "e").defaultPrevented).toBe(false);
  canvas().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  press(canvas(), "e");
  expect(app.store.get(editor$).tool).toBe("eraser");
  const before = app.store.get(editor$).gridVisible;
  press(canvas(), "g");
  press(canvas(), "g", { repeat: true });
  expect(app.store.get(editor$).gridVisible).toBe(!before);
  const zoom = app.store.get(editor$).viewport.zoom;
  press(canvas(), "-", { repeat: true });
  expect(app.store.get(editor$).viewport.zoom).toBeLessThan(zoom);
  const prevented = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
  prevented.preventDefault();
  canvas().dispatchEvent(prevented);
  expect(app.store.get(editor$).tool).toBe("eraser");
});

it("retains both history modifiers and makes Shift+2 a no-op for missing or empty highlights", () => {
  app.store.set(beginStroke$, { x: 0, y: 0 });
  app.store.set(finishStroke$);
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
    press(canvas(), "z", modifier);
    expect(app.store.get(editor$).beads).toBe(0);
    press(canvas(), "Z", { ...modifier, shiftKey: true });
    expect(app.store.get(editor$).beads).toBe(1);
  }
  for (const code of [null, "H2"]) {
    app.store.set(highlightColor$, code);
    const before = app.store.get(editor$);
    press(canvas(), "@", { shiftKey: true });
    expect(app.store.get(editor$)).toEqual(before);
  }
});

it("keeps Space from editing, releases it across focus and composition changes, and retains Enter", () => {
  const idle = canvas().style.cursor;
  press(canvas(), " ");
  expect(canvas().style.cursor).toBe("grab");
  press(canvas(), "Enter");
  expect(app.store.get(editor$).beads).toBe(0);
  window.dispatchEvent(new KeyboardEvent("keyup", { key: " " }));
  expect(canvas().style.cursor).toBe(idle);
  press(canvas(), "Enter");
  expect(app.store.get(editor$).beads).toBe(1);
  for (const interrupt of [
    () => host.querySelector<HTMLInputElement>(".title-input")!.focus(),
    () => canvas().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })),
    () => window.dispatchEvent(new Event("blur")),
    () => press(canvas(), "Escape"),
  ]) {
    canvas().focus();
    press(canvas(), " ");
    expect(canvas().style.cursor).toBe("grab");
    interrupt();
    expect(canvas().style.cursor).toBe(idle);
    press(canvas(), " ", { repeat: true });
    expect(canvas().style.cursor).toBe(idle);
    canvas().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  }
  const button = host.querySelector<HTMLButtonElement>('[aria-label="Eraser"]')!;
  button.focus();
  expect(press(button, " ").defaultPrevented).toBe(false);
});

it("isolates help and creation, translates help, and restores its invoking focus", () => {
  const invoker = canvas();
  press(invoker, "?");
  expect(host.querySelector<HTMLDialogElement>(".keyboard-dialog")!.open).toBe(true);
  expect(host.querySelector(".keyboard-dialog")?.textContent).toContain("Fit highlighted color");
  const close = host.querySelector<HTMLButtonElement>(".keyboard-heading button")!;
  press(close, "e");
  press(close, "g");
  expect(app.store.get(editor$).tool).toBe("pencil");
  expect(app.store.get(editor$).gridVisible).toBe(true);
  app.store.set(selectLocale$, "zh-CN");
  expect(host.querySelector(".keyboard-dialog")?.textContent).toContain("快捷键");
  close.click();
  expect(host.querySelector(".keyboard-dialog")).toBeNull();
  expect(document.activeElement).toBe(invoker);
  press(invoker, "?");
  app.store.set(showCreate$);
  expect(host.querySelector(".keyboard-dialog")).toBeNull();
  press(host.querySelector("h1")!, "e");
  expect(app.store.get(editor$).tool).toBe("pencil");
  app.store.set(showEditor$);
  expect(host.querySelector(".keyboard-dialog")).toBeNull();
});

it("owns Safari body-targeted keys without leaking shortcuts to other mounts or after teardown", () => {
  const otherHost = document.createElement("div");
  document.body.append(otherHost);
  const other = mountApp(otherHost, { storage: () => ({ getItem: () => null, setItem() {} }) });
  try {
    other.store.set(newDocument$, 2, 1);
    const otherCanvas = otherHost.querySelector<HTMLCanvasElement>("canvas")!;
    otherCanvas.focus();
    press(document.body, "e");
    expect(other.store.get(editor$).tool).toBe("eraser");
    expect(app.store.get(editor$).tool).toBe("pencil");
    canvas().focus();
    press(document.body, "b");
    expect(app.store.get(editor$).tool).toBe("bucket");
    expect(other.store.get(editor$).tool).toBe("eraser");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(press(document.body, "e").defaultPrevented).toBe(false);
    expect(app.store.get(editor$).tool).toBe("bucket");
    canvas().focus();
    app.destroy();
    app.store.set(chooseTool$, "pencil");
    press(document.body, "e");
    expect(app.store.get(editor$).tool).toBe("pencil");
  } finally {
    other.destroy();
    otherHost.remove();
  }
});

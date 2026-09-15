import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { html, nothing, render } from "lit-html";
import { select } from "../src/ui/select.js";
import { mountSelects } from "../src/ui/select-controller.js";

let host: HTMLElement;
let controller: ReturnType<typeof mountSelects>;
let value: string;
let disabled: boolean;
const changed = vi.fn();
const disconnect = vi.fn();
const choices = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
function draw(label = "Appearance") {
  render(
    html`<fieldset ?disabled=${disabled}>
      ${select(label, value, choices, (next) => {
        changed(next);
        value = next;
        draw(label);
      })}
    </fieldset>`,
    host,
  );
  const trigger = host.querySelector<HTMLButtonElement>(".select-trigger")!;
  // jsdom has neither top-layer popovers nor layout. Browser tests exercise both engines.
  vi.spyOn(trigger, "getClientRects").mockReturnValue([
    new DOMRect(20, 20, 100, 36),
  ] as unknown as DOMRectList);
  const popup = host.querySelector<HTMLElement>(".select-menu")!;
  popup.showPopover = vi.fn();
  popup.hidePopover = vi.fn();
  controller.sync();
  return trigger;
}
function key(trigger: HTMLElement, key: string, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
  trigger.dispatchEvent(event);
  return event;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect = disconnect;
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  controller = mountSelects(host);
  value = "system";
  disabled = false;
});
afterEach(() => {
  controller.destroy();
  render(nothing, host);
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps tentative navigation separate from the value through rerenders and cancellation", () => {
  const trigger = draw();
  trigger.click();
  key(trigger, "End");
  expect(changed).not.toHaveBeenCalled();
  draw("外观");
  expect(host.querySelector(".select-trigger")).toBe(trigger);
  expect(trigger.getAttribute("aria-activedescendant")).toBe(
    host.querySelector('[data-value="dark"]')!.id,
  );
  expect(key(trigger, "Escape").defaultPrevented).toBe(true);
  expect(trigger.value).toBe("system");
  expect(document.activeElement).toBe(trigger);
  expect(trigger.hasAttribute("aria-activedescendant")).toBe(false);
  key(trigger, "d");
  key(trigger, "Enter");
  expect(changed).toHaveBeenCalledExactlyOnceWith("dark");
  expect(trigger.value).toBe("dark");
});

it("blocks disabled fieldsets and closes when a pending export disables an open control", () => {
  disabled = true;
  const trigger = draw();
  trigger.click();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  disabled = false;
  draw();
  trigger.click();
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  key(trigger, "End");
  disabled = true;
  draw();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(changed).not.toHaveBeenCalled();
  expect(disconnect).toHaveBeenCalledOnce();
});

it("does not treat IME or modified text keys as option searches", () => {
  const trigger = draw();
  key(trigger, "d", { isComposing: true });
  key(trigger, "d", { ctrlKey: true });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  key(trigger, "d");
  const tab = key(trigger, "Tab");
  expect(tab.defaultPrevented).toBe(false);
  expect(changed).toHaveBeenCalledExactlyOnceWith("dark");
});

it("cleans up an open menu on removal and unmount without leaving active listeners", () => {
  const trigger = draw();
  trigger.click();
  const popup = host.querySelector<HTMLElement>(".select-menu")!;
  controller.destroy();
  expect(popup.hidePopover).toHaveBeenCalledOnce();
  expect(disconnect).toHaveBeenCalledOnce();
  trigger.click();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  controller = mountSelects(host);
  trigger.click();
  render(nothing, host);
  controller.sync();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(disconnect).toHaveBeenCalledTimes(2);
  expect(changed).not.toHaveBeenCalled();
});

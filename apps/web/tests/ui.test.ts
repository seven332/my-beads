import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { html, nothing, render } from "lit-html";
import { createRef } from "lit-html/directives/ref.js";
import { keyed } from "lit-html/directives/keyed.js";
import { X } from "@lucide/icons";
import { button, iconButton, type ButtonOptions } from "../src/ui/button.js";
import { field } from "../src/ui/field.js";
import { modal } from "../src/ui/dialog.js";

let host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  render(nothing, host);
  host.remove();
});

it("only submits a form through an explicitly enabled submit action", () => {
  const action = vi.fn(),
    submit = vi.fn((event: Event) => event.preventDefault());
  const view = (disabled: boolean) =>
    html`<form @submit=${submit}>
      ${button("Preview", { onClick: action })}
      ${button("Download", { type: "submit", variant: "primary", disabled })}
    </form>`;
  render(view(true), host);
  const [preview, download] = host.querySelectorAll("button");
  preview.click();
  download.click();
  expect(action).toHaveBeenCalledOnce();
  expect(submit).not.toHaveBeenCalled();
  render(view(false), host);
  expect(host.querySelectorAll("button")[1]).toBe(download);
  download.click();
  expect(submit).toHaveBeenCalledOnce();
});

it("updates a focused action in place, removing stale states and event handlers", () => {
  const first = vi.fn(),
    second = vi.fn();
  const view = (options: ButtonOptions) => button("Grid", options);
  render(
    view({
      onClick: first,
      pressed: true,
      expanded: true,
      controls: "panel",
      title: "Grid (G)",
      shortcut: "G",
      label: "Show grid",
    }),
    host,
  );
  const control = host.querySelector("button")!;
  control.focus();
  control.click();
  render(view({ onClick: second, pressed: false, expanded: false, controls: "panel" }), host);
  expect(host.querySelector("button")).toBe(control);
  expect(document.activeElement).toBe(control);
  expect(control.getAttribute("aria-pressed")).toBe("false");
  expect(control.getAttribute("aria-expanded")).toBe("false");
  for (const name of ["aria-label", "aria-keyshortcuts", "title"])
    expect(control.hasAttribute(name)).toBe(false);
  control.click();
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  expect(second.mock.calls[0][0].target).toBe(control);
  render(view({}), host);
  for (const name of ["aria-pressed", "aria-expanded", "aria-controls"])
    expect(control.hasAttribute(name)).toBe(false);
  control.click();
  expect(second).toHaveBeenCalledOnce();
});

it("keeps an icon action's accessible name independent of its decorative graphic", () => {
  render(iconButton("Close export", X), host);
  const control = host.querySelector("button")!;
  expect(control.getAttribute("aria-label")).toBe("Close export");
  expect(control.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
});

it("preserves native labels, pending field edits and explicit keyed resets", () => {
  const view = (label: string, session: number) =>
    html`<form>
      ${keyed(session, field(label, html`<input name="columns" .defaultValue=${"50"} />`))}
    </form>`;
  render(view("Columns", 1), host);
  const input = host.querySelector("input")!;
  input.focus();
  input.value = "123";
  input.setSelectionRange(1, 2);
  render(view("列数", 1), host);
  expect(host.querySelector("input")).toBe(input);
  expect(input.labels?.[0]?.textContent).toContain("列数");
  expect(document.activeElement).toBe(input);
  expect([input.selectionStart, input.selectionEnd]).toEqual([1, 2]);
  expect(new FormData(host.querySelector("form")!).get("columns")).toBe("123");
  render(view("Columns", 2), host);
  expect(host.querySelector("input")).not.toBe(input);
  expect(new FormData(host.querySelector("form")!).get("columns")).toBe("50");
});

it("leaves modal opening to its owner and dispatches native cancellation to the current action", () => {
  const dialog = createRef<HTMLDialogElement>(),
    first = vi.fn(),
    second = vi.fn();
  const view = (cancel: () => void) =>
    modal(
      { ref: dialog, labelledBy: "heading", className: "export-dialog", onCancel: cancel },
      html`<h2 id="heading">Export</h2>`,
    );
  render(view(first), host);
  const element = dialog.value!;
  expect(element.isConnected).toBe(true);
  expect(element.open).toBe(false);
  render(view(second), host);
  expect(dialog.value).toBe(element);
  const event = new Event("cancel", { cancelable: true });
  element.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
  render(nothing, host);
  expect(dialog.value).toBeUndefined();
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountApp } from "../src/app.js";
import { chooseColor$, newDocument$ } from "../src/state.js";

let app: ReturnType<typeof mountApp>;
let host: HTMLElement;
const disconnect = vi.fn();
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect = disconnect; });
  host = document.createElement("div"); document.body.append(host); app = mountApp(host);
});
afterEach(() => { app.destroy(); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("boots the real app, updates controls and preserves its Canvas node", async () => {
  await vi.waitFor(() => expect(host.querySelector("canvas")).not.toBeNull());
  const canvas = host.querySelector("canvas");
  const eraser = host.querySelector<HTMLButtonElement>('[aria-label="Eraser"]')!;
  eraser.click();
  await vi.waitFor(() => expect(eraser.getAttribute("aria-pressed")).toBe("true"));
  const search = host.querySelector<HTMLInputElement>('[aria-label="Search colors"]')!;
  search.value = "H7"; search.dispatchEvent(new Event("input", { bubbles: true }));
  await vi.waitFor(() => expect(host.querySelectorAll("button.color")).toHaveLength(1));
  host.querySelector<HTMLButtonElement>("button.color")!.click();
  expect(host.querySelector("canvas")).toBe(canvas);
  expect(host.querySelector(".selected-color strong")?.textContent).toBe("H7");
  expect(host.querySelector('[data-testid="counts"]')?.textContent).toBe("0 beads · 0 colors");
});

it("shows validation feedback without replacing the current grid", async () => {
  app.store.set(newDocument$, 3, 2);
  app.store.set(newDocument$, 0, 2);
  await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain("integers"));
  expect(host.querySelector(".canvas-status")?.textContent).toContain("3 × 2 cells");
});

it("disconnects Canvas and watcher on destroy and allows independent mounts", async () => {
  await vi.waitFor(() => expect(host.querySelector("canvas")).not.toBeNull());
  const otherHost = document.createElement("div"); document.body.append(otherHost);
  const other = mountApp(otherHost);
  try {
    app.store.set(chooseColor$, "H2");
    await vi.waitFor(() => expect(host.querySelector(".selected-color strong")?.textContent).toBe("H2"));
    expect(otherHost.querySelector(".selected-color strong")?.textContent).toBe("H7");
    app.destroy(); app.store.set(chooseColor$, "H5");
    await Promise.resolve();
    expect(host.childElementCount).toBe(0);
    expect(disconnect).toHaveBeenCalled();
  } finally { other.destroy(); otherHost.remove(); }
});

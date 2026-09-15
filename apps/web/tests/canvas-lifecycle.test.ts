import { afterEach, expect, it, vi } from "vitest";
import { mountCanvas } from "../src/canvas.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("rearms density observation, coalesces redraws and removes listeners on teardown", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const queries: EventTarget[] = [];
  const media = vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const target = Object.assign(new EventTarget(), { media: query, matches: true });
    queries.push(target);
    return target as MediaQueryList;
  });
  vi.stubGlobal("devicePixelRatio", 1);
  const canvas = document.createElement("canvas");
  const controller = mountCanvas(canvas, {
    begin() {},
    extend() {},
    finish() {},
    pan() {},
    zoom() {},
  });
  try {
    expect(media).toHaveBeenLastCalledWith("(resolution: 1dppx)");
    frames[0](0);
    vi.stubGlobal("devicePixelRatio", 3);
    queries[0].dispatchEvent(new Event("change"));
    expect(media).toHaveBeenLastCalledWith("(resolution: 3dppx)");
    expect(frames).toHaveLength(2);
    queries[0].dispatchEvent(new Event("change"));
    expect(media).toHaveBeenCalledTimes(2);
    queries[1].dispatchEvent(new Event("change"));
    expect(media).toHaveBeenCalledTimes(3);
    expect(frames).toHaveLength(2);
    controller.destroy();
    expect(cancel).toHaveBeenCalledWith(2);
    queries[2].dispatchEvent(new Event("change"));
    expect(media).toHaveBeenCalledTimes(3);
    expect(frames).toHaveLength(2);
  } finally {
    controller.destroy();
  }
});

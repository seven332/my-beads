import { afterEach, expect, it, vi } from "vitest";
import { runImageConversion, type ImageConversionRequest } from "../src/image-worker.js";
import { convertImage } from "@my-beads/core";

const request: ImageConversionRequest = {
  pixels: { width: 1, height: 1, data: Uint8Array.from([0, 0, 0, 255]) },
  options: { mode: "image", columns: 1, rows: 1, alpha: 128, maxColors: 24 },
  overrides: {},
};
afterEach(() => vi.unstubAllGlobals());
it.each(["message", "error", "messageerror", "abort", "post", "failed"])(
  "terminates worker resources on %s",
  async (outcome) => {
    const worker = new EventTarget();
    const terminate = vi.fn();
    const postMessage = vi.fn(() => {
      if (outcome === "post") throw new Error("Cannot clone");
    });
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          return Object.assign(worker, { terminate, postMessage });
        }
      },
    );
    const controller = new AbortController();
    const promise = runImageConversion(request, controller.signal);
    const assertion =
      outcome === "message"
        ? expect(promise).resolves.toEqual(convertImage(request.pixels, request.options))
        : expect(promise).rejects.toMatchObject(
            outcome === "abort" ? { name: "AbortError" } : { code: "imageWorker" },
          );
    if (outcome === "abort") controller.abort();
    else if (outcome === "message" || outcome === "failed")
      worker.dispatchEvent(
        new MessageEvent("message", {
          data:
            outcome === "message"
              ? { result: convertImage(request.pixels, request.options) }
              : { failed: true },
        }),
      );
    else if (outcome !== "post") worker.dispatchEvent(new Event(outcome));
    await assertion;
    expect(postMessage).toHaveBeenCalledWith(request);
    expect(terminate).toHaveBeenCalledOnce();
    controller.abort();
    worker.dispatchEvent(new Event("error"));
    expect(terminate).toHaveBeenCalledOnce();
  },
);
it("reports Worker startup failure and does not start an already-aborted request", async () => {
  const created = vi.fn();
  vi.stubGlobal(
    "Worker",
    class {
      constructor() {
        created();
        throw new Error("Blocked");
      }
    },
  );
  await expect(runImageConversion(request, new AbortController().signal)).rejects.toMatchObject({
    code: "imageWorker",
  });
  expect(() => runImageConversion(request, AbortSignal.abort())).toThrow();
  expect(created).toHaveBeenCalledOnce();
});

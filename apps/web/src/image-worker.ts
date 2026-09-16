import type { RgbaImage, ImageConversionOptions, ImageConversionResult } from "@my-beads/core";
import { UiError } from "./errors.js";

export interface ImageConversionRequest {
  pixels: RgbaImage;
  options: ImageConversionOptions;
  overrides: Readonly<Record<string, string>>;
}
export type ImageWorkerReply = { result: ImageConversionResult } | { failed: true };
export type ImageConverter = (
  request: ImageConversionRequest,
  signal: AbortSignal,
) => Promise<ImageConversionResult>;

/** A conversion owns its Worker, including termination of CPU work on supersession. */
export const runImageConversion: ImageConverter = (request, signal) => {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./image-worker-entry.ts", import.meta.url), { type: "module" });
    } catch {
      reject(new UiError("imageWorker"));
      return;
    }
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      worker.removeEventListener("message", message);
      worker.removeEventListener("error", error);
      worker.removeEventListener("messageerror", error);
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const error = () => {
      cleanup();
      reject(new UiError("imageWorker"));
    };
    const message = (event: MessageEvent<ImageWorkerReply>) => {
      cleanup();
      if (signal.aborted) reject(signal.reason);
      else if ("result" in event.data) resolve(event.data.result);
      else reject(new UiError("imageWorker"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.addEventListener("message", message);
    worker.addEventListener("error", error);
    worker.addEventListener("messageerror", error);
    try {
      worker.postMessage(request);
    } catch {
      error();
    }
  });
};

import { convertImage } from "@my-beads/core";
import type { ImageConversionRequest, ImageWorkerReply } from "./image-worker.js";

self.addEventListener("message", (event: MessageEvent<ImageConversionRequest>) => {
  let reply: ImageWorkerReply;
  try {
    const { pixels, options, overrides } = event.data;
    reply = { result: convertImage(pixels, options, overrides) };
  } catch {
    reply = { failed: true };
  }
  self.postMessage(reply);
});

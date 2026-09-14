import { UiError } from "./errors.js";
import { validateImageSize, type RgbaImage } from "@my-beads/core";

/** The file adapter owns the decoder and URL; only bounded RGBA data leaves it. */
export async function readImage(file: File, signal: AbortSignal): Promise<RgbaImage> {
  signal.throwIfAborted();
  if (!["image/png", "image/webp"].includes(file.type)) throw new UiError("imageType");
  if (file.size > 10_000_000) throw new UiError("imageFileSize");
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        signal.removeEventListener("abort", abort);
        image.onload = null;
        image.onerror = null;
      };
      const abort = () => {
        cleanup();
        image.src = "";
        reject(signal.reason);
      };
      image.onload = () => {
        cleanup();
        resolve();
      };
      image.onerror = () => {
        cleanup();
        reject(new UiError("imageDecode"));
      };
      signal.addEventListener("abort", abort, { once: true });
      image.src = url;
    });
    signal.throwIfAborted();
    const width = image.naturalWidth,
      height = image.naturalHeight;
    validateImageSize(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    try {
      const context = canvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
      if (!context) throw new UiError("canvasUnavailable");
      context.drawImage(image, 0, 0);
      return { width, height, data: context.getImageData(0, 0, width, height).data };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    image.src = "";
    URL.revokeObjectURL(url);
  }
}

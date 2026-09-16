import { command } from "ccstate";
import { convertImage } from "@my-beads/core";
import {
  changeImageSettings$,
  imageSession$,
  loadImage$,
  updateImage$,
  type ImageSource,
} from "../src/image-state.js";
import type { ImageConverter } from "../src/image-worker.js";

/** Exercise the real converter through the browser IO boundary without jsdom Workers. */
export const convertInTest: ImageConverter = async (request, signal) => {
  signal.throwIfAborted();
  return convertImage(request.pixels, request.options, request.overrides);
};

export const loadPixelImage$ = command(
  async ({ get, set }, source: ImageSource, signal: AbortSignal) => {
    const id = await set(loadImage$, source, signal);
    signal.throwIfAborted();
    const session = get(imageSession$);
    if (id === undefined || session?.id !== id) return;
    set(changeImageSettings$, {
      ...session.options,
      mode: "pixel",
      maxColors: 221,
      lockAspect: false,
    });
    await set(updateImage$, convertInTest, signal);
    signal.throwIfAborted();
  },
);

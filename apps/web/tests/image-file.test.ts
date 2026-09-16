import { expect, it } from "vitest";
import { readImage } from "../src/image-file.js";

it("rejects unsupported, oversized and already-aborted input before allocating image resources", async () => {
  const controller = new AbortController();
  await expect(
    readImage(new File(["text"], "text.svg", { type: "image/svg+xml" }), controller.signal),
  ).rejects.toThrow("PNG, WebP or JPEG");
  await expect(
    readImage(
      new File([new Uint8Array(10_000_001)], "large.png", { type: "image/png" }),
      controller.signal,
    ),
  ).rejects.toThrow("10 MB");
  controller.abort();
  await expect(
    readImage(new File([], "image.png", { type: "image/png" }), controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
});

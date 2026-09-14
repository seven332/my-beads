import { expect, type Page } from "@playwright/test";

/** Decode the actual CSS images, including in the production build at a repository path. */
export async function checkToolCursors(page: Page) {
  const canvas = page.getByRole("img", { name: "Pattern canvas" });
  const cursors = new Set<string>();
  for (const [tool, hotspot] of [
    ["Pencil", "6 26"],
    ["Eraser", "12 25"],
    ["Paint bucket", "24 26"],
    ["Eyedropper", "6 26"],
  ]) {
    await page.getByRole("button", { name: tool, exact: true }).click();
    // Inspect before moving onto the canvas: switching must update immediately.
    await expect(canvas).toHaveCSS("cursor", new RegExp(` ${hotspot}, crosshair$`));
    const image = await canvas.evaluate(async (element) => {
      const css = getComputedStyle(element).cursor;
      const url = /url\("([^"]+)"\)/.exec(css)![1];
      const image = new Image();
      image.src = url;
      await image.decode();
      return { url, width: image.naturalWidth, height: image.naturalHeight };
    });
    expect(image.url).toMatch(/^data:image\/svg\+xml,/);
    expect([image.width, image.height]).toEqual([32, 32]);
    cursors.add(image.url);
  }
  expect(cursors.size).toBe(4);
  await page.getByRole("button", { name: "Pan", exact: true }).click();
  await expect(canvas).toHaveCSS("cursor", "grab");
  await page.getByRole("button", { name: "Pencil", exact: true }).click();
}

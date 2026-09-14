import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parsePatternCsv } from "@my-beads/core";
import { openExport, fitCoordinates } from "./helpers.js";

const black = [0, 0, 0, 255],
  white = [255, 255, 255, 255],
  orange = [239, 117, 64, 255];
const emptyLight = [245, 246, 242, 255],
  emptyDark = [228, 230, 227, 255];

async function scene(page: Page, csv: string) {
  await page.goto("/");
  await page
    .getByLabel("Open CSV")
    .setInputFiles({ name: "rendering.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByLabel("Pattern title")).toHaveValue("rendering");
  const canvas = page.getByRole("img", { name: "Pattern canvas" });
  const columns = parsePatternCsv(csv)[0].length;
  const { box, zoom, cell } = await fitCoordinates(page, columns, 1);
  const point = (column: number, u = 0.5, v = 0.5) => ({
    x: cell(column, 0).x - box.x + (u - 0.5) * zoom,
    y: cell(column, 0).y - box.y + (v - 0.5) * zoom,
  });
  // Inspect actual rendered pixels rather than saved screenshot baselines or store state.
  const pixel = (column: number, u = 0.5, v = 0.5) =>
    canvas.evaluate(
      (node, point) => {
        const element = node as HTMLCanvasElement,
          rect = element.getBoundingClientRect();
        return [
          ...element
            .getContext("2d")!
            .getImageData(
              Math.floor((point.x * element.width) / rect.width),
              Math.floor((point.y * element.height) / rect.height),
              1,
              1,
            ).data,
        ];
      },
      point(column, u, v),
    );
  const move = (column: number, dy = 0) =>
    page.mouse.move(box.x + point(column).x, box.y + point(column).y + dy);
  const click = (column: number) =>
    page.mouse.click(box.x + point(column).x, box.y + point(column).y);
  const cursorPixels = () =>
    canvas.evaluate(async (node) => {
      // A negative assertion must inspect the queued redraw, not an earlier cleared frame.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const element = node as HTMLCanvasElement,
        context = element.getContext("2d")!;
      const pixels = context.getImageData(0, 0, element.width, element.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (
          pixels[i] === 239 &&
          pixels[i + 1] === 117 &&
          pixels[i + 2] === 64 &&
          pixels[i + 3] === 255
        )
          count++;
      return count;
    });
  return {
    canvas,
    pixel,
    move,
    click,
    cursorPixels,
    border: (column: number) => pixel(column, 1 / zoom),
    point,
    zoom,
  };
}

test("hovering with different tool cursors preserves the selected cell", async ({ page }) => {
  const { canvas, move, border, pixel } = await scene(page, "H2,H7,H2");
  for (const tool of ["Pencil", "Eraser", "Paint bucket", "Eyedropper", "Pan"]) {
    await page.getByRole("button", { name: tool, exact: true }).click();
    await canvas.focus();
    await expect.poll(() => border(0)).toEqual(orange);
    await move(2);
    // Verify the post-hover frame, rather than passing on the previous selection.
    await canvas.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await expect.poll(() => border(0)).toEqual(orange);
    expect(await border(2)).not.toEqual(orange);
    expect(await pixel(0)).toEqual(white);
    expect(await pixel(1)).toEqual(black);
  }
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

for (const tool of ["Eyedropper", "Paint bucket", "Pencil", "Eraser"] as const) {
  test(`${tool} clears the cursor outside the grid and navigation never creates an edge selection`, async ({
    page,
  }) => {
    // Selecting cell 1 is a no-op, but an unintended edit/pick at the other cells is observable.
    const csv = tool === "Eraser" ? "H7,,H7,H7" : "H2,H7,H2,H2";
    const { click, move, cursorPixels } = await scene(page, csv);
    await page.getByRole("button", { name: tool, exact: true }).click();
    // All four sides are still inside the full-window Canvas element, but not the grid.
    for (const [column, dy] of [
      [-1, 0],
      [4, 0],
      [1, -32],
      [1, 32],
    ]) {
      await click(1);
      await expect.poll(cursorPixels).toBeGreaterThan(0);
      await move(column, dy);
      await page.mouse.down();
      await expect.poll(cursorPixels).toBe(0);
      await move(2);
      await page.mouse.up();
      await expect.poll(cursorPixels).toBe(0);
      // A key press on the still-focused, deselected surface must not paint a boundary cell.
      await page.keyboard.press("Enter");
      await page.keyboard.press("Space");
      await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
      await expect(page.locator(".selected-color strong")).toHaveText("H7");
      await page.mouse.wheel(16, 0);
      await expect.poll(cursorPixels).toBe(0);
      await page.keyboard.press("Shift+ArrowRight");
      await expect.poll(cursorPixels).toBe(0);
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -30);
      await page.keyboard.up("Control");
      await expect.poll(cursorPixels).toBe(0);
      await page.getByRole("button", { name: "Fit to window", exact: true }).click();
    }
    await page.getByRole("button", { name: "Pan", exact: true }).click();
    await move(-1);
    await page.mouse.down();
    await move(-2);
    await page.mouse.up();
    await expect.poll(cursorPixels).toBe(0);
    await page.mouse.wheel(0, 32);
    await expect.poll(cursorPixels).toBe(0);
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
    await expect(page.locator(".selected-color strong")).toHaveText("H7");
    await openExport(page);
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    expect(parsePatternCsv(await readFile((await (await pending).path())!, "utf8"))).toEqual(
      parsePatternCsv(csv),
    );
  });
}

test("middle-button panning and wheel navigation keep the cursor attached to its original cell", async ({
  page,
}) => {
  const { click, move, border, pixel, cursorPixels, zoom } = await scene(page, "H7,H7,H7,H7");
  await page.getByRole("button", { name: "Eyedropper", exact: true }).click();
  await click(1);
  await expect.poll(() => border(1)).toEqual(orange);
  await move(-1);
  await page.mouse.down({ button: "middle" });
  await move(-2);
  await page.mouse.up({ button: "middle" });
  await expect.poll(() => border(0)).toEqual(orange);
  await page.mouse.wheel(32, 0);
  await expect.poll(() => border(-1)).toEqual(orange);
  // Zoom around the selected cell's center; its left edge scales with that cell.
  await move(-1);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -40);
  await page.keyboard.up("Control");
  const nextZoom = zoom * Math.exp(0.2);
  await expect.poll(() => pixel(-1, 0.5 - (nextZoom / 2 - 1) / zoom)).toEqual(orange);
  await expect.poll(cursorPixels).toBeGreaterThan(0);
  await expect(page.locator(".selected-color strong")).toHaveText("H7");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

test("a stroke crossing the grid boundary clips its paint, hides the cursor and supports reentry", async ({
  page,
}) => {
  const { canvas, move, border, pixel, cursorPixels } = await scene(page, "H2,H2,H2,H2");
  await move(1);
  await page.mouse.down();
  await move(6);
  await expect.poll(cursorPixels).toBe(0);
  await expect.poll(() => pixel(0)).toEqual(white);
  await expect.poll(() => pixel(3)).toEqual(black);
  await move(2);
  await expect.poll(() => border(2)).toEqual(orange);
  await move(6);
  await page.mouse.up();
  await expect.poll(cursorPixels).toBe(0);
  await page.keyboard.press("Enter");
  await expect.poll(() => pixel(0)).toEqual(white);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => border(0)).toEqual(orange);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => pixel(3)).toEqual(white);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await canvas.focus();
  await canvas.press("Enter");
  await expect.poll(() => pixel(0)).toEqual(black);
});

for (const tool of ["Eyedropper", "Paint bucket", "Pencil", "Eraser"] as const) {
  test(`${tool} redraws the cursor when the document and selected color stay unchanged`, async ({
    page,
  }) => {
    const csv = tool === "Eraser" ? ",,,H2" : tool === "Pencil" ? "H7,H7,H7,H2" : "H7,H7,,H2";
    const { border, click, move } = await scene(page, csv);
    await page.getByRole("button", { name: tool, exact: true }).click();
    await click(0);
    await expect.poll(() => border(0)).toEqual(orange);
    // The second click cannot rely on a focus event to trigger a redraw.
    await click(1);
    await expect.poll(() => border(1)).toEqual(orange);
    await expect.poll(() => border(0)).toEqual(tool === "Eraser" ? emptyLight : black);
    await page.mouse.down();
    await move(2);
    await expect.poll(() => border(2)).toEqual(orange);
    await expect.poll(() => border(1)).toEqual(tool === "Eraser" ? emptyDark : black);
    await page.mouse.up();
    if (tool === "Eyedropper") {
      await click(0);
      await expect.poll(() => border(0)).toEqual(orange);
      await click(2);
      await expect.poll(() => border(2)).toEqual(orange);
      await expect(page.locator(".selected-color strong")).toHaveText("H7");
      await click(3);
      await expect.poll(() => border(3)).toEqual(orange);
      await expect(page.locator(".selected-color strong")).toHaveText("H2");
    }
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
    await openExport(page);
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download" }).click();
    expect(parsePatternCsv(await readFile((await (await pending).path())!, "utf8"))).toEqual(
      parsePatternCsv(csv),
    );
  });
}

test("drawing, erasing, filling and history redraw visible cells without moving the viewport", async ({
  page,
}) => {
  const { pixel, click, move } = await scene(page, "H2,H2,H2,H2");
  await expect.poll(() => pixel(0)).toEqual(white);
  await move(0);
  await page.mouse.down();
  await expect.poll(() => pixel(0)).toEqual(black);
  await move(1);
  await expect.poll(() => pixel(1)).toEqual(black);
  await page.mouse.up();
  await expect.poll(() => pixel(1)).toEqual(black);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => pixel(0)).toEqual(white);
  await expect.poll(() => pixel(1)).toEqual(white);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect.poll(() => pixel(0)).toEqual(black);
  await expect.poll(() => pixel(1)).toEqual(black);
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  await click(0);
  await expect.poll(() => pixel(0)).toEqual(emptyLight);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => pixel(0)).toEqual(black);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect.poll(() => pixel(0)).toEqual(emptyLight);
  await page.getByRole("button", { name: "Paint bucket", exact: true }).click();
  await click(2);
  await expect.poll(() => pixel(2)).toEqual(black);
  await expect.poll(() => pixel(3)).toEqual(black);
});

test("keyboard focus, grid and code overlays and resizing redraw without editing", async ({
  page,
}) => {
  const { canvas, pixel, click, border, point, zoom } = await scene(page, "H7,H2");
  await page.getByRole("button", { name: "Eyedropper", exact: true }).click();
  await click(0);
  await expect.poll(() => border(0)).toEqual(orange);
  await canvas.press("ArrowRight");
  await expect.poll(() => border(1)).toEqual(orange);
  await expect.poll(() => border(0)).toEqual(black);
  await page.getByLabel("Pattern title").focus();
  await expect.poll(() => border(1)).toEqual(white);
  await canvas.focus();
  await expect.poll(() => border(1)).toEqual(orange);
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await expect.poll(() => pixel(0, 0, 0.25)).toEqual(black);
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await expect.poll(() => pixel(0, 0, 0.25)).not.toEqual(black);
  const hasCode = () =>
    canvas.evaluate(
      (node, area) => {
        const element = node as HTMLCanvasElement,
          rect = element.getBoundingClientRect();
        const ratioX = element.width / rect.width,
          ratioY = element.height / rect.height;
        const pixels = element
          .getContext("2d")!
          .getImageData(
            Math.floor(area.x * ratioX),
            Math.floor(area.y * ratioY),
            Math.floor(area.size * ratioX),
            Math.floor(area.size * ratioY),
          ).data;
        return pixels.some(
          (value, index) =>
            index % 4 === 0 && value > 200 && pixels[index + 1] > 200 && pixels[index + 2] > 200,
        );
      },
      { ...point(0, 0.2, 0.2), size: zoom * 0.6 },
    );
  await expect.poll(hasCode).toBe(false);
  await page.getByRole("button", { name: "Codes", exact: true }).click();
  await expect.poll(hasCode).toBe(true);
  await page.getByRole("button", { name: "Codes", exact: true }).click();
  await expect.poll(hasCode).toBe(false);
  const before = await canvas.evaluate((node) => (node as HTMLCanvasElement).width);
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect
    .poll(() => canvas.evaluate((node) => (node as HTMLCanvasElement).width))
    .not.toBe(before);
  await expect
    .poll(() =>
      canvas.evaluate(
        (node) =>
          (node as HTMLCanvasElement).width ===
          Math.round(node.getBoundingClientRect().width * Math.min(devicePixelRatio, 2)),
      ),
    )
    .toBe(true);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

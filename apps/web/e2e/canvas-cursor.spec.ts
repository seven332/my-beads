import { test, expect, type Page } from "@playwright/test";
import { checkToolCursors } from "./cursor-helpers.js";
import { fitCoordinates } from "./helpers.js";

async function scene(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("Open CSV")
    .setInputFiles({ name: "cursors.csv", mimeType: "text/csv", buffer: Buffer.from("H2,H7,H2") });
  await expect(page.getByLabel("Pattern title")).toHaveValue("cursors");
  const { center } = await fitCoordinates(page, 3, 1);
  return { canvas: page.getByRole("img", { name: "Pattern canvas" }), center };
}

test("tools load distinct native cursor images without changing the document", async ({ page }) => {
  const { canvas, center } = await scene(page);
  await checkToolCursors(page);
  await page.mouse.move(center.x, center.y);
  await expect(canvas).toHaveCSS("cursor", / 6 26, crosshair$/);
  await expect(page.getByTestId("counts")).toHaveText("3 beads · 2 colors");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

test("pan and middle-button overrides show grabbing and restore the selected tool on release", async ({
  page,
}) => {
  const { canvas, center } = await scene(page);
  for (const tool of ["Pan", "Pencil", "Eraser", "Paint bucket", "Eyedropper"]) {
    await page.getByRole("button", { name: tool, exact: true }).click();
    const idle = await canvas.evaluate((node) => getComputedStyle(node).cursor);
    const button = tool === "Pan" ? "left" : "middle";
    await page.mouse.move(center.x, center.y);
    await page.mouse.down({ button });
    await expect(canvas).toHaveCSS("cursor", "grabbing");
    await page.mouse.move(center.x + 20, center.y + 10);
    await expect(canvas).toHaveCSS("cursor", "grabbing");
    await page.mouse.up({ button });
    await expect(canvas).toHaveCSS("cursor", idle);
  }
  await expect(page.getByTestId("counts")).toHaveText("3 beads · 2 colors");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

for (const tool of ["Pan", "Pencil"]) {
  test(`${tool} restores its cursor after interrupted panning`, async ({ page }) => {
    const { canvas, center } = await scene(page);
    await page.getByRole("button", { name: tool, exact: true }).click();
    const idle = await canvas.evaluate((node) => getComputedStyle(node).cursor);
    const button = tool === "Pan" ? "left" : "middle";
    await canvas.evaluate((element) =>
      element.addEventListener("pointerdown", (event) => {
        element.setAttribute("data-pointer-id", String((event as PointerEvent).pointerId));
      }),
    );
    for (const termination of [
      "pointercancel",
      "lost-pressed",
      "lost-released",
      "escape",
      "canvas-blur",
      "window-blur",
    ]) {
      await page.mouse.move(center.x, center.y);
      await page.mouse.down({ button });
      await expect(canvas).toHaveCSS("cursor", "grabbing");
      if (termination === "escape") await page.keyboard.press("Escape");
      else if (termination === "canvas-blur")
        await canvas.evaluate((node) => (node as HTMLElement).blur());
      else if (termination === "window-blur")
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      else
        await canvas.evaluate(
          (element, termination) =>
            element.dispatchEvent(
              new PointerEvent(
                termination === "pointercancel" ? "pointercancel" : "lostpointercapture",
                {
                  pointerId: Number(element.getAttribute("data-pointer-id")),
                  buttons: termination === "lost-pressed" ? 4 : 0,
                },
              ),
            ),
          termination,
        );
      // Assert before mouseup; normal release must not mask a broken cancellation path.
      await expect(canvas).toHaveCSS("cursor", idle);
      await page.mouse.up({ button });
      await expect(canvas).toHaveCSS("cursor", idle);
    }
    await expect(page.getByTestId("counts")).toHaveText("3 beads · 2 colors");
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  });
}

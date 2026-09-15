import { test, expect } from "@playwright/test";
import { selectChoice, fitCoordinates } from "./helpers.js";

test("unrelated renders preserve a captured stroke, then keep a text selection and native dialog focus", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Open CSV")
    .setInputFiles({ name: "Stable.csv", mimeType: "text/csv", buffer: Buffer.from(",,") });
  const canvas = page.locator(".pattern-canvas"),
    original = await canvas.elementHandle();
  const { cell } = await fitCoordinates(page, 3, 1);
  await canvas.evaluate((element) =>
    element.addEventListener(
      "pointerdown",
      (event) => {
        element.setAttribute("data-pointer", String((event as PointerEvent).pointerId));
      },
      { once: true },
    ),
  );
  await page.mouse.move(cell(0, 0).x, cell(0, 0).y);
  await page.mouse.down();
  await expect(page.getByTestId("counts")).toHaveText("1 bead · 1 color");
  // Update the interface without moving focus or releasing the active pointer.
  await page.locator(".language-picker .select-trigger").evaluate((element) => {
    (element as HTMLButtonElement).value = "zh-CN";
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(await canvas.evaluate((element, old) => element === old, original)).toBe(true);
  expect(
    await canvas.evaluate((element) =>
      element.hasPointerCapture(Number(element.getAttribute("data-pointer"))),
    ),
  ).toBe(true);
  await page.mouse.move(cell(1, 0).x, cell(1, 0).y);
  await page.mouse.up();
  await expect(page.getByTestId("counts")).toHaveText("2 颗 · 1 色");
  await selectChoice(page.locator(".language-picker .select-trigger"), "en-US");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");

  const title = page.locator(".title-input");
  await title.fill("Stable title");
  await title.evaluate((element) => (element as HTMLInputElement).setSelectionRange(2, 5));
  await page
    .getByRole("button", { name: "Grid", exact: true })
    .evaluate((element) => (element as HTMLButtonElement).click());
  await expect(title).toBeFocused();
  expect(
    await title.evaluate((element) => [
      (element as HTMLInputElement).selectionStart,
      (element as HTMLInputElement).selectionEnd,
    ]),
  ).toEqual([2, 5]);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export pattern" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeFocused();
  expect(await canvas.evaluate((element, old) => element === old, original)).toBe(true);
});

import { test, expect } from "@playwright/test";

test("the production color picker is styled and maps visual input at the Pages subpath", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  await page.getByRole("button", { name: "Open color picker" }).click();
  const area = page.locator(".color-area");
  await expect(area).toHaveCSS("touch-action", "none");
  expect((await area.boundingBox())!.height).toBeGreaterThan(100);
  await expect(area).toHaveCSS("background-image", /linear-gradient/);
  await page.getByLabel("Color format", { exact: true }).selectOption("hsb");
  await page.getByRole("spinbutton", { name: "Hue (degrees)", exact: true }).fill("60");
  await page.getByRole("spinbutton", { name: "Saturation (%)", exact: true }).fill("15.8");
  await page.getByRole("spinbutton", { name: "Brightness (%)", exact: true }).fill("29.8");
  await expect(page.getByLabel("Search colors", { exact: true })).toHaveValue("#4C4C40");
  await expect(
    page.getByRole("button", { name: "B23 #303921", exact: true }),
  ).toHaveAccessibleDescription(/Preserve chroma/);
  await expect(page.locator(".selected-color strong")).toHaveText("H7");
});

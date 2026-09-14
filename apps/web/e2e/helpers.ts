import { expect, type Page } from "@playwright/test";

export async function startNew(page: Page) {
  if (await page.getByRole("button", { name: "New pattern", exact: true }).isVisible())
    await page.getByRole("button", { name: "New pattern", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Create a pattern", exact: true })).toBeVisible();
}
export async function continueEditing(page: Page) {
  if (await page.getByRole("button", { name: "Continue editing", exact: true }).isVisible())
    await page.getByRole("button", { name: "Continue editing", exact: true }).click();
  await expect(page.getByRole("img", { name: "Pattern canvas" })).toBeVisible();
}
export async function openExport(page: Page) {
  if (await page.getByRole("dialog", { name: "Export pattern" }).isVisible()) return;
  await continueEditing(page);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export pattern" })).toBeVisible();
}
export async function closeExport(page: Page) {
  await page.getByRole("button", { name: "Back to editing", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export pattern" })).toHaveCount(0);
}

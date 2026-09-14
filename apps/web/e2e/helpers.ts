import { expect, type Page } from "@playwright/test";
import { unobscuredArea, type CanvasEdge } from "../src/canvas-viewport.js";

export async function openPalette(page: Page) {
  const toggle = page.locator(".palette-toggle");
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator(".palette-view button").nth(1).click();
  await expect(page.locator(".palette-search")).toBeVisible();
}

export async function fitCoordinates(page: Page, columns: number, rows: number) {
  await page.locator(".zoom-controls button").last().click();
  const canvas = page.locator(".pattern-canvas");
  const box = (await canvas.boundingBox())!;
  const panels = await page.locator("[data-canvas-panel]").evaluateAll(nodes => nodes.map(node => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height, edge: getComputedStyle(node).getPropertyValue("--canvas-edge").trim() };
  }));
  const area = unobscuredArea(box, panels.map(panel => ({ ...panel, edge: panel.edge as CanvasEdge })));
  const zoom = Math.max(0.25, Math.min(32, (area.width - 64) / columns, (area.height - 64) / rows));
  const center = { x: box.x + area.x + area.width / 2, y: box.y + area.y + area.height / 2 };
  return { box, area, zoom, center, cell: (x: number, y: number) => ({
    x: center.x + (x + .5 - columns / 2) * zoom, y: center.y + (y + .5 - rows / 2) * zoom,
  }) };
}

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

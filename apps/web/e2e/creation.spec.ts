import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parsePatternCsv } from "@my-beads/core";
import { startNew, continueEditing, openExport, closeExport } from "./helpers.js";

test("creates only on request, returns to the current work, and exports without leaving the editor", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create a pattern" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Blank canvas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "From CSV" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "From an image" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Pattern canvas" })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("my-beads.draft"))).toBeNull();
  await page.getByLabel("Columns", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  await expect(page.getByRole("alert")).toContainText("integers");
  await page.getByLabel("Columns", { exact: true }).fill("3");
  await page.getByLabel("Rows", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  await page.getByLabel("Pattern title").fill("A work in progress");
  await page.getByRole("img", { name: "Pattern canvas" }).press("Enter");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const zoom = await page.getByLabel("Zoom level").textContent();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("my-beads.draft")!).grid[0][0]))
    .toBe("H7");
  const saved = await page.evaluate(() => localStorage.getItem("my-beads.draft"));
  await startNew(page);
  await expect(page.getByText("A work in progress", { exact: true })).toBeVisible();
  await page
    .getByLabel("Open CSV")
    .setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("#55514C") });
  await expect(page.getByRole("alert")).toContainText("Unknown MARD color");
  expect(await page.evaluate(() => localStorage.getItem("my-beads.draft"))).toBe(saved);
  await continueEditing(page);
  await expect(page.getByLabel("Zoom level")).toHaveText(zoom!);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await openExport(page);
  await expect(page.getByLabel("Pixel scale")).toHaveCount(0);
  await expect(page.getByLabel("Chart width")).toHaveCount(0);
  await page.getByRole("dialog").press("Control+z");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  expect(parsePatternCsv(await readFile((await (await pending).path())!, "utf8"))).toEqual([
    ["H7", null, null],
    [null, null, null],
  ]);
  await page.getByRole("dialog").press("Escape");
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
  await page.reload();
  await expect(page.getByLabel("Pattern title")).toHaveValue("A work in progress");
  await expect(page.getByRole("heading", { name: "Create a pattern" })).toHaveCount(0);
});

test("CSV ignores blank-canvas settings and preserves empty borders through export", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Columns", { exact: true }).fill("20");
  await page.getByLabel("Rows", { exact: true }).fill("30");
  await page
    .getByLabel("Open CSV")
    .setInputFiles({
      name: "Borders.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("\uFEFF,,,\r\n,H5,#000000,\r\n,,,\r\n"),
    });
  await expect(page.locator(".canvas-status")).toContainText("4 × 3 cells");
  await openExport(page);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  expect(parsePatternCsv(await readFile((await (await pending).path())!, "utf8"))).toEqual([
    [null, null, null, null],
    [null, "H5", "H7", null],
    [null, null, null, null],
  ]);
});

test("creation errors are visible beside the chosen method on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Columns", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  await expect(page.getByRole("alert")).toContainText("integers");
  await expect(page.getByRole("alert")).toBeInViewport();
  const csv = page.getByRole("region", { name: "From CSV", exact: true });
  await csv.scrollIntoViewIfNeeded();
  await page
    .getByLabel("Open CSV")
    .setInputFiles({ name: "invalid.csv", mimeType: "text/csv", buffer: Buffer.from("#55514C") });
  await expect(csv.getByRole("alert")).toContainText("Unknown MARD color");
  await expect(csv.getByRole("alert")).toBeInViewport();
  await expect(page.getByRole("alert")).toHaveCount(1);
  await page
    .getByLabel("Open CSV")
    .setInputFiles({
      name: "invalid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("W".repeat(100)),
    });
  await expect(csv.getByRole("alert")).toContainText("W".repeat(100));
  expect(await csv.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("creation, recreation and export remain usable in both languages on narrow screens", async ({
  page,
}) => {
  await page.goto("/");
  for (const locale of ["en-US", "zh-CN"]) {
    await page.locator(".language-picker select").selectOption(locale);
    for (const width of [320, 390, 600, 740, 900]) {
      await page.setViewportSize({ width, height: 844 });
      const layout = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
        cards: [...document.querySelectorAll(".creation-card")].map(
          (node) => node.scrollWidth <= node.clientWidth,
        ),
      }));
      expect(layout.content).toBeLessThanOrEqual(layout.width);
      expect(layout.cards).toEqual([true, true, true]);
    }
  }
  await page.locator(".language-picker select").selectOption("en-US");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole("button", { name: "Create blank grid" }).click();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByLabel("Pattern title").fill("W".repeat(100));
  await startNew(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await openExport(page);
  await page.getByLabel("Export format").selectOption("pixel");
  await page.getByLabel("Pixel scale").fill("3");
  const dialog = page.getByRole("dialog");
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await closeExport(page);
  await openExport(page);
  await expect(page.getByLabel("Pixel scale")).toHaveValue("3");
});

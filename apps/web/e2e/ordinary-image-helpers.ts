import { expect, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { readFile } from "node:fs/promises";
import { defaultPalette, parsePatternCsv } from "@my-beads/core";
import { openExport } from "./helpers.js";

export function richImage() {
  const image = new PNG({ width: 100, height: 60 });
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      image.data.set(
        [
          Math.round((x * 255) / 99),
          Math.round((y * 255) / 59),
          80 + ((x + y) % 120),
          x < 4 ? 0 : 255,
        ],
        i,
      );
    }
  return PNG.sync.write(image);
}

export async function ordinaryImageWorkflow(page: Page) {
  await page
    .getByLabel("Open image", { exact: true })
    .setInputFiles({ name: "Gradient.png", mimeType: "image/png", buffer: richImage() });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Target columns")).toHaveValue("50");
  await expect(dialog.getByLabel("Target rows")).toHaveValue("30");
  await expect(dialog.getByLabel("Maximum bead colors")).toHaveValue("24");
  await expect(dialog.getByRole("button", { name: "Apply image" })).toBeEnabled();
  await expect(dialog.locator(".mapping-row")).toHaveCount(0);
  await dialog.getByLabel("Target columns").fill("40");
  await expect(dialog.getByLabel("Target rows")).toHaveValue("24");
  await dialog.getByLabel("Maximum bead colors").fill("8");
  await dialog.getByRole("button", { name: "Apply image" }).click();
  await openExport(page);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const grid = parsePatternCsv(await readFile((await (await pending).path())!, "utf8"));
  expect([grid[0].length, grid.length]).toEqual([40, 24]);
  expect(grid.flat()).toContain(null);
  const codes = new Set(grid.flat().filter((code): code is string => !!code));
  expect(codes.size).toBeGreaterThan(1);
  expect(codes.size).toBeLessThanOrEqual(8);
  for (const code of codes) expect(defaultPalette.colors).toHaveProperty(code);
}

import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { openExport } from "../helpers.js";

test("built theme tokens reach utilities and native controls without recoloring pattern exports", async ({
  page,
}) => {
  await page.goto("./");
  const card = page.getByRole("region", { name: "Blank canvas", exact: true });
  await expect(card).toHaveCSS("background-color", "rgb(252, 252, 249)");
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--ui-surface", "#112233");
    document.documentElement.style.setProperty("--ui-primary", "#456789");
  });
  await expect(card).toHaveCSS("background-color", "rgb(17, 34, 51)");
  await expect(page.getByRole("button", { name: "Create blank grid" })).toHaveCSS(
    "background-color",
    "rgb(69, 103, 137)",
  );
  await page
    .getByLabel("Open CSV")
    .setInputFiles({ name: "Colors.csv", mimeType: "text/csv", buffer: Buffer.from("H7,H2") });
  await openExport(page);
  await expect(page.getByRole("dialog")).toHaveCSS("background-color", "rgb(17, 34, 51)");
  await page.getByLabel("Export format").selectOption("pixel");
  await page.getByLabel("Pixel scale").fill("1");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const download = await pending;
  const png = PNG.sync.read(await readFile((await download.path())!));
  expect([png.width, png.height]).toEqual([2, 1]);
  expect([...png.data]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
});

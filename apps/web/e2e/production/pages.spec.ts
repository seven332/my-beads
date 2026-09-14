import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parsePatternCsv } from "@my-beads/core";
import { openExport, openPalette } from "../helpers.js";
import { checkToolCursors } from "../cursor-helpers.js";

test("built editor loads at a repository path and preserves editing, exports and drafts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) =>
    errors.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("./");
  const assets = await page
    .locator('script[src], link[rel="stylesheet"]')
    .evaluateAll((nodes) =>
      nodes.map(
        (node) =>
          new URL(node.getAttribute("src") ?? node.getAttribute("href")!, document.baseURI)
            .pathname,
      ),
    );
  expect(assets.length).toBeGreaterThanOrEqual(2);
  for (const path of assets) expect(path).toMatch(/^\/my-beads\/assets\//);
  await expect(page.getByRole("heading", { name: "Create a pattern" })).toBeVisible();
  await page
    .getByLabel("Open CSV")
    .setInputFiles({ name: "Pages.csv", mimeType: "text/csv", buffer: Buffer.from('H7,""') });
  await expect(page.getByLabel("Pattern title")).toHaveValue("Pages");
  await expect(page.getByTestId("counts")).toHaveText("1 bead · 1 color");
  await checkToolCursors(page);
  await openPalette(page);
  await page.getByLabel("Search colors").fill("H2");
  await page.getByRole("button", { name: "H2 #FFFFFF", exact: true }).click();
  const canvas = page.getByRole("img", { name: "Pattern canvas" });
  await canvas.press("ArrowRight");
  await canvas.press("Enter");
  await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
  await canvas.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(canvas).toBeFocused();
  await canvas.press("e");
  await expect(page.getByRole("button", { name: "Eraser", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await canvas.press("Space");
  await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
  await openExport(page);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await pending;
  expect(parsePatternCsv(await readFile((await download.path())!, "utf8"))).toEqual([["H7", "H2"]]);
  await expect(page.getByLabel("Draft status")).toContainText("saved on this device");
  await page.reload();
  await expect(page.getByLabel("Pattern title")).toHaveValue("Pages");
  await expect(page.getByLabel("Draft status")).toContainText("Recovered");
  await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByRole("link", { name: "我来拼豆" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.reload();
  await expect(page.getByLabel("界面语言")).toHaveValue("zh-CN");
  await expect(page.getByTestId("counts")).toHaveText("2 颗 · 2 色");
  expect(errors).toEqual([]);
});

import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { parsePatternCsv } from "@my-beads/core";
import { openPalette } from "./helpers.js";

test.use({ locale: "zh-CN" });

async function download(page: Page, label: string): Promise<Buffer> {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: label }).click();
  const result = await readFile((await (await pending).path())!);
  await page.getByRole("button", { name: label === "下载" ? "返回编辑" : "Back to editing", exact: true }).click();
  return result;
}

test("uses the Chinese brand, persists language and keeps exports in English", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "我来拼豆" })).toBeVisible();
  await expect(page.getByLabel("界面语言")).toHaveValue("zh-CN");
  await expect(page).toHaveTitle("我来拼豆 — 拼豆图纸编辑器");
  await page.getByLabel("打开 CSV").setInputFiles({ name: "Bilingual.csv", mimeType: "text/csv", buffer: Buffer.from("H7,,H5\nH2,H7,") });
  await expect(page.getByTestId("counts")).toHaveText("4 颗 · 3 色");
  await page.getByLabel("搜索颜色").fill("#4C4C40");
  await expect(page.getByText("色差最小", { exact: true })).toBeVisible();
  await expect(page.getByText("保留色彩倾向", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByLabel("导出格式").selectOption("svg");
  await page.getByLabel("图纸宽度").fill("800");
  const chineseSvg = await download(page, "下载");
  expect(chineseSvg.toString()).toContain("3 × 2 grid · 3 colors · 4 beads");
  expect(chineseSvg.toString()).toContain("MARD 221");
  expect(chineseSvg.toString()).not.toMatch(/[\u4e00-\u9fff]/);
  await page.getByLabel("界面语言").selectOption("en-US");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByLabel("Export format")).toHaveValue("svg");
  expect(await download(page, "Download")).toEqual(chineseSvg);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("Export format").selectOption("csv");
  expect(parsePatternCsv((await download(page, "Download")).toString())).toEqual([["H7", null, "H5"], ["H2", "H7", null]]);
  await page.reload();
  await expect(page.getByRole("link", { name: "My Beads" })).toBeVisible();
  await expect(page.getByLabel("Pattern title")).toHaveValue("Bilingual");
  await expect(page.getByTestId("counts")).toHaveText("4 beads · 3 colors");
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByText("已恢复保存的草稿。", { exact: true })).toBeVisible();
});

test("imports images with Chinese controls and validation, then exports the mapped pixels", async ({ page }) => {
  const source = new PNG({ width: 2, height: 1 });
  source.data.set([0, 0, 0, 255, 255, 255, 255, 255]);
  await page.goto("/");
  await page.getByLabel("打开图片", { exact: true }).setInputFiles({ name: "Two colors.png", mimeType: "image/png", buffer: PNG.sync.write(source) });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("导入像素图", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "应用图片" })).toBeEnabled();
  await dialog.getByLabel("目标列数").fill("0");
  await dialog.getByRole("button", { name: "更新预览" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("目标网格行列数必须是 1 到 256 的整数。");
  await dialog.getByLabel("目标列数").fill("2"); await dialog.getByLabel("目标行数").fill("1");
  await dialog.getByRole("button", { name: "更新预览" }).click();
  await expect(dialog.getByRole("img", { name: "MARD 配色预览" })).toBeVisible();
  await expect(dialog.getByText("2 种原图颜色", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "应用图片" }).click();
  await expect(page.getByTestId("counts")).toHaveText("2 颗 · 2 色");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByLabel("导出格式").selectOption("pixel");
  await page.getByLabel("像素放大倍率").fill("3");
  const pixel = PNG.sync.read(await download(page, "下载"));
  expect([pixel.width, pixel.height]).toEqual([6, 3]);
  expect([...pixel.data.subarray(0, 4)]).toEqual([0, 0, 0, 255]);
  expect([...pixel.data.subarray(12, 16)]).toEqual([255, 255, 255, 255]);
});

test("keeps language controls and color recommendations within narrow viewports in both languages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "创建空白网格", exact: true }).click();
  await page.getByLabel("搜索颜色").fill("#4C4C40");
  for (const locale of ["zh-CN", "en-US"]) {
    await page.locator(".language-picker select").selectOption(locale);
    for (const width of [320, 390, 461, 480, 600, 740, 900]) {
      await page.setViewportSize({ width, height: 900 });
      await openPalette(page);
      await expect(page.locator(".language-picker select")).toBeVisible();
      const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth,
        controls: [...document.querySelectorAll(".language-picker select, .import-button, .color-recommendation")].map(node => {
          const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right };
        }) }));
      expect(layout.content, `${locale} at ${width}px`).toBeLessThanOrEqual(layout.width);
      for (const control of layout.controls) { expect(control.left).toBeGreaterThanOrEqual(0); expect(control.right).toBeLessThanOrEqual(width); }
    }
  }
});

import { expect, test } from "@playwright/test";
import en from "../src/i18n/locales/en-US.json" with { type: "json" };
import zh from "../src/i18n/locales/zh-CN.json" with { type: "json" };
import { selectChoice, fitCoordinates, openPalette } from "./helpers.js";

for (const width of [1440, 320]) {
  test(`SVG controls keep their names, actions and Canvas through language updates at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator(".creation-icon svg")).toHaveCount(3);
    await page.getByLabel("Columns", { exact: true }).fill("2");
    await page.getByLabel("Rows", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Create blank grid" }).click();
    const canvas = await page.locator(".pattern-canvas").elementHandle();
    for (const [locale, copy] of [
      ["en-US", en],
      ["zh-CN", zh],
    ] as const) {
      await selectChoice(page.locator(".language-picker .select-trigger"), locale);
      for (const name of [
        copy.tools.pencil,
        copy.tools.eraser,
        copy.tools.bucketLabel,
        copy.tools.eyedropperLabel,
        copy.tools.pan,
      ]) {
        const button = page.getByRole("button", { name, exact: true });
        const graphic = button.locator("svg");
        await expect(graphic).toHaveAttribute("aria-hidden", "true");
        await expect(graphic).toHaveAttribute("focusable", "false");
        await graphic.click();
        await expect(button).toHaveAttribute("aria-pressed", "true");
        const rendered = await graphic.evaluate((svg) => ({
          namespace: svg.namespaceURI,
          stroke: getComputedStyle(svg).stroke,
          color: getComputedStyle(svg.closest("button")!).color,
        }));
        expect(rendered.namespace).toBe("http://www.w3.org/2000/svg");
        expect(rendered.stroke).toBe(rendered.color);
      }
      await page
        .getByRole("button", { name: copy.tools.pencil, exact: true })
        .locator("svg")
        .click();
      const { cell } = await fitCoordinates(page, 2, 2);
      await page.mouse.click(cell(0, 0).x, cell(0, 0).y);
      const undo = page.getByRole("button", { name: copy.app.undo, exact: true });
      const redo = page.getByRole("button", { name: copy.app.redo, exact: true });
      await expect(undo).toBeEnabled();
      await undo.locator("svg").click();
      await expect(undo).toBeDisabled();
      await redo.locator("svg").click();
      await expect(undo).toBeEnabled();
      await undo.locator("svg").click();
      await expect(page.getByTestId("counts")).toHaveText(
        locale === "en-US" ? "0 beads · 0 colors" : "0 颗 · 0 色",
      );

      await openPalette(page);
      if (await page.locator(".palette-toggle").isVisible()) {
        await page
          .getByRole("button", { name: copy.palette.close, exact: true })
          .locator("svg")
          .click();
        await expect(page.locator(".palette-toggle")).toBeFocused();
      }
      const exportButton = page.getByRole("button", { name: copy.export.open, exact: true });
      await exportButton.locator("svg").click();
      await expect(page.getByRole("dialog", { name: copy.export.heading })).toBeVisible();
      await page
        .getByRole("button", { name: copy.export.close, exact: true })
        .locator("svg")
        .click();
      await expect(exportButton).toBeFocused();
      expect(
        await page
          .locator(".pattern-canvas")
          .evaluate((node, previous) => node === previous, canvas),
      ).toBe(true);
      expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
    }
    await canvas?.dispose();
  });
}

import { test, expect, type Locator, type Page } from "@playwright/test";
import { fitCoordinates, openExport, openPalette, selectChoice } from "./helpers.js";

async function create(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create blank grid" }).click();
}

async function expectAlignedMenu(trigger: Locator, iconOnly = false) {
  await trigger.click();
  const popup = trigger.page().locator(`#${await trigger.getAttribute("aria-controls")}`);
  await expect(popup).toBeInViewport({ ratio: 1 });
  const button = (await trigger.boundingBox())!;
  const menu = (await popup.boundingBox())!;
  expect(menu.y >= button.y + button.height || menu.y + menu.height <= button.y).toBe(true);
  const icon = (await trigger.locator(".icon").boundingBox())!;
  if (iconOnly) {
    expect(button.width).toBe(button.height);
    expect(menu.width).toBeGreaterThan(button.width * 2);
    expect(menu.x).toBeLessThanOrEqual(button.x + 1);
    expect(menu.x + menu.width).toBeGreaterThanOrEqual(button.x + button.width);
  }
  for (const option of await popup.getByRole("option").all()) {
    const row = (await option.boundingBox())!;
    const shape = (element: Element) => {
      const style = getComputedStyle(element);
      return [
        style.borderWidth,
        style.borderRadius,
        style.fontSize,
        style.fontWeight,
        style.lineHeight,
      ];
    };
    expect(Math.abs(row.height - button.height)).toBeLessThan(1);
    expect(await option.evaluate(shape)).toEqual(await trigger.evaluate(shape));
    if (!iconOnly) {
      expect(Math.abs(row.x - button.x)).toBeLessThan(1);
      expect(Math.abs(row.width - button.width)).toBeLessThan(1);
      const marker = (await option.locator(".icon:last-child").boundingBox())!;
      expect(Math.abs(marker.x + marker.width / 2 - icon.x - icon.width / 2)).toBeLessThan(1);
      expect(Math.abs(marker.y - row.y - (icon.y - button.y))).toBeLessThan(1);
      const label = (await trigger.locator(".select-value").boundingBox())!;
      expect(
        await trigger
          .locator(".select-value > span:first-child")
          .evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
      const text = option.locator(":scope > span");
      expect(Math.abs((await text.boundingBox())!.x - label.x)).toBeLessThan(1);
      expect(Math.abs((await text.boundingBox())!.y - row.y - (label.y - button.y))).toBeLessThan(
        1,
      );
      expect(await text.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(
        await text.evaluate((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return range.getClientRects().length;
        }),
      ).toBe(1);
    } else {
      const leading = (await option.locator(".icon:first-child").boundingBox())!;
      const label = (await option.locator(":scope > span").boundingBox())!;
      const check = (await option.locator(".icon:last-child").boundingBox())!;
      expect(leading.width).toBe(icon.width);
      const delta = leading.x - icon.x;
      if (delta > 1) expect(menu.x).toBeCloseTo(8, 0);
      else if (delta < -1)
        expect(menu.x + menu.width).toBeCloseTo(trigger.page().viewportSize()!.width - 8, 0);
      else expect(Math.abs(delta)).toBeLessThan(1);
      expect(label.x).toBeGreaterThan(leading.x + leading.width);
      expect(check.x).toBeGreaterThan(label.x);
    }
  }
  const active = popup.locator("[data-active]");
  await expect(active).toHaveCSS(
    "border-color",
    await trigger.evaluate((node) => getComputedStyle(node).borderColor),
  );
  await expect(active).toHaveCSS(
    "background-color",
    await trigger.evaluate((node) => getComputedStyle(node).backgroundColor),
  );
  await trigger.press("Escape");
}

for (const locale of ["en-US", "zh-CN"]) {
  test(`menus align their text and icon columns with the triggers in ${locale}`, async ({
    page,
  }) => {
    await page.goto("/");
    await selectChoice(page.getByRole("combobox", { name: "Language" }), locale);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectAlignedMenu(page.locator(".appearance-picker .select-trigger"), true);
      await expectAlignedMenu(page.locator(".language-picker .select-trigger"));
    }
    await page.locator(".blank-form button").click();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectAlignedMenu(page.locator(".appearance-picker .select-trigger"), true);
      await expectAlignedMenu(page.locator(".language-picker .select-trigger"));
      await page
        .getByRole("button", { name: locale === "en-US" ? "Export" : "导出", exact: true })
        .click();
      await expectAlignedMenu(page.locator(".export-form .select-trigger"));
      await page.keyboard.press("Escape");
      await openPalette(page);
      await page.locator(".color-picker-toggle").click();
      await expectAlignedMenu(page.locator(".color-format .select-trigger"));
      await page.keyboard.press("Escape");
    }
  });
}

test("keyboard navigation previews choices, cancels, commits with Enter/Space/Tab, and isolates shortcuts", async ({
  page,
}) => {
  await create(page);
  const trigger = page.getByRole("combobox", { name: "Appearance" });
  await expect(trigger).toMatchAriaSnapshot('- combobox "Appearance": System');
  await trigger.focus();
  await trigger.press("ArrowDown");
  await trigger.press("End");
  await expect(trigger).toHaveJSProperty("value", "system");
  await expect(page.getByRole("option", { name: "Dark", exact: true })).toHaveAttribute(
    "data-active",
    "",
  );
  await expect(page.getByRole("option", { name: "System", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await trigger.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await trigger.press("d");
  await trigger.press("Enter");
  await expect(trigger).toHaveJSProperty("value", "dark");
  await expect(trigger).toMatchAriaSnapshot('- combobox "Appearance": Dark');
  await trigger.press("Space");
  await trigger.press("Home");
  await trigger.press("ArrowDown");
  await trigger.press("Space");
  await expect(trigger).toHaveJSProperty("value", "light");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.press("ArrowUp");
  await trigger.press("End");
  await trigger.press("Tab");
  await expect(trigger).toHaveJSProperty("value", "dark");
  await expect(page.getByRole("combobox", { name: "Language" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Pencil", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
});

test("Escape closes only the menu inside export, and Tab keeps the modal usable", async ({
  page,
}) => {
  await create(page);
  await openExport(page);
  const dialog = page.getByRole("dialog", { name: "Export pattern" });
  const trigger = page.getByRole("combobox", { name: "Export format" });
  await trigger.click();
  await trigger.press("End");
  await trigger.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveJSProperty("value", "csv");
  await trigger.press("p");
  await trigger.press("Tab");
  await expect(trigger).toHaveJSProperty("value", "pixel");
  await expect(page.getByLabel("Pixel scale")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

for (const tool of ["Pencil", "Eraser"]) {
  test(`dismissing a header menu on Canvas cannot use ${tool}`, async ({ page }) => {
    await create(page);
    const { cell } = await fitCoordinates(page, 50, 50);
    const point = cell(10, 10);
    if (tool === "Eraser") await page.mouse.click(point.x, point.y);
    await page.getByRole("button", { name: tool, exact: true }).click();
    const counts = await page.getByTestId("counts").textContent();
    const trigger = page.getByRole("combobox", { name: "Appearance" });
    await trigger.click();
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 15, point.y);
    await page.mouse.up();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("counts")).toHaveText(counts!);
    await page.mouse.click(point.x, point.y);
    await expect(page.getByTestId("counts")).toHaveText(
      tool === "Pencil" ? "1 bead · 1 color" : "0 beads · 0 colors",
    );
  });
}

test("a middle-button Canvas gesture dismisses the menu before Canvas can start panning", async ({
  page,
}) => {
  await create(page);
  const { cell } = await fitCoordinates(page, 50, 50);
  const point = cell(10, 10);
  const canvas = page.locator(".pattern-canvas");
  await canvas.evaluate((node) => {
    node.setAttribute("data-received-downs", "0");
    node.addEventListener("pointerdown", () => {
      node.setAttribute(
        "data-received-downs",
        String(Number(node.getAttribute("data-received-downs")) + 1),
      );
    });
  });
  const trigger = page.getByRole("combobox", { name: "Appearance" });
  await trigger.click();
  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(point.x + 25, point.y + 20);
  await page.mouse.up({ button: "middle" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(canvas).toHaveAttribute("data-received-downs", "0");
  await expect(trigger).toBeFocused();
  await page.mouse.down({ button: "middle" });
  await page.mouse.up({ button: "middle" });
  await expect(canvas).toHaveAttribute("data-received-downs", "1");
  await expect(canvas).toBeFocused();
});

test("outside controls retain their actions and navigation removes open menus", async ({
  page,
}) => {
  await create(page);
  const appearance = page.getByRole("combobox", { name: "Appearance" });
  const language = page.getByRole("combobox", { name: "Language" });
  await appearance.click();
  await language.click();
  await expect(appearance).toHaveAttribute("aria-expanded", "false");
  await expect(language).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "New pattern", exact: true }).click();
  await expect(page.locator(":popover-open")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Create a pattern" })).toBeVisible();
  await selectChoice(page.getByRole("combobox", { name: "Appearance" }), "dark");
});

test("color format menus survive rerenders and close before parent modality changes", async ({
  page,
}) => {
  await create(page);
  await openPalette(page);
  await page.locator(".color-picker-toggle").click();
  const trigger = page.getByRole("combobox", { name: "Color format", exact: true });
  await trigger.click();
  const old = await trigger.elementHandle();
  await trigger.press("r");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("option", { name: "RGB", exact: true })).toHaveAttribute(
    "data-active",
    "",
  );
  await trigger.press("Escape");
  await expect(page.locator(".color-picker")).toBeVisible();
  await trigger.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(await trigger.evaluate((node, previous) => node === previous, old)).toBe(true);
  await selectChoice(trigger, "rgb");
  await trigger.press("Escape");
  await expect(page.locator(".color-picker")).toHaveCount(0);
});

test.describe("compact touch menus", () => {
  test.use({ hasTouch: true, viewport: { width: 320, height: 568 } });
  test("touch choices stay in the viewport above the picker sheet without moving surrounding content", async ({
    page,
  }) => {
    await create(page);
    await selectChoice(page.getByRole("combobox", { name: "Language" }), "zh-CN");
    await selectChoice(page.getByRole("combobox", { name: "外观" }), "dark");
    await openPalette(page);
    await page.locator(".color-picker-toggle").tap();
    const trigger = page.getByRole("combobox", { name: "颜色格式", exact: true });
    const bounds = await page.locator(".color-picker").boundingBox();
    await trigger.tap();
    const popup = page.getByRole("listbox", { name: "颜色格式", exact: true });
    await expect(popup).toBeInViewport({ ratio: 1 });
    expect(await page.locator(".color-picker").boundingBox()).toEqual(bounds);
    for (const option of await popup.getByRole("option").all())
      expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await popup.getByRole("option", { name: "RGB", exact: true }).tap();
    await expect(trigger).toHaveJSProperty("value", "rgb");
    await expect(page.getByLabel("红（0–255）", { exact: true })).toBeVisible();
    await trigger.tap();
    await page.touchscreen.tap(4, 4);
    await expect(popup).toBeHidden();
    await expect(page.locator(".color-picker")).toBeVisible();
    await expect(page.getByTestId("counts")).toHaveText("0 颗 · 0 色");
  });
});

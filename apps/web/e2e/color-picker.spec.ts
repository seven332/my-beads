import { test, expect, type Page } from "@playwright/test";
import { selectChoice, openPalette } from "./helpers.js";

async function scene(page: Page, target?: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  await openPalette(page);
  if (target) await page.locator(".palette-search").fill(target);
  await page.getByRole("button", { name: "Open color picker" }).click();
  await expect(page.getByRole("slider", { name: "Adjust hue" })).toBeFocused();
  await expect(page.getByRole("slider", { name: "Adjust hue" })).toBeInViewport({ ratio: 1 });
  await selectChoice(page.getByRole("combobox", { name: "Color format", exact: true }), "hsb");
  return page.locator(".color-area");
}

test("HEX, RGB, HSL and HSB edit the same target without changing the brush or Canvas", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  await page.getByRole("button", { name: "Open color picker" }).click();
  const format = page.getByRole("combobox", { name: "Color format", exact: true });
  const search = page.getByLabel("Search colors", { exact: true });
  const canvas = await page.locator(".pattern-canvas").elementHandle();
  const area = await page.locator(".color-area").elementHandle();
  await expect(format).toHaveJSProperty("value", "hex");
  await page.getByLabel("Hex color", { exact: true }).fill("336699");
  await expect(search).toHaveValue("#336699");
  await selectChoice(format, "rgb");
  await expect(page.getByLabel("Red (0–255)", { exact: true })).toHaveValue("51");
  await expect(page.getByLabel("Green (0–255)", { exact: true })).toHaveValue("102");
  await expect(page.getByLabel("Blue (0–255)", { exact: true })).toHaveValue("153");
  await selectChoice(format, "hsl");
  await expect(page.getByLabel("Hue (degrees)", { exact: true })).toHaveValue("210");
  await expect(page.getByLabel("Saturation (%)", { exact: true })).toHaveValue("50");
  await expect(page.getByLabel("Lightness (%)", { exact: true })).toHaveValue("40");
  await selectChoice(format, "hsb");
  await expect(page.getByLabel("Saturation (%)", { exact: true })).toHaveValue("66.7");
  await expect(page.getByLabel("Brightness (%)", { exact: true })).toHaveValue("60");
  await expect(search).toHaveValue("#336699");
  await selectChoice(format, "rgb");
  const red = page.getByLabel("Red (0–255)", { exact: true });
  await red.fill("256");
  await expect(search).toHaveValue("#336699");
  await red.press("Tab");
  await expect(red).toHaveValue("51");
  await red.fill("255");
  await expect(search).toHaveValue("#FF6699");
  await selectChoice(format, "hsl");
  await page.getByLabel("Hue (degrees)", { exact: true }).fill("240");
  await page.getByLabel("Saturation (%)", { exact: true }).fill("100");
  await page.getByLabel("Lightness (%)", { exact: true }).fill("50");
  await expect(search).toHaveValue("#0000FF");
  await page.getByLabel("Saturation (%)", { exact: true }).fill("");
  await selectChoice(format, "hsb");
  await expect(page.getByLabel("Saturation (%)", { exact: true })).toHaveValue("100");
  await expect(page.getByLabel("Brightness (%)", { exact: true })).toHaveValue("100");
  await expect(page.locator(".selected-color strong")).toHaveText("H7");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  expect(await canvas!.evaluate((node) => node === document.querySelector(".pattern-canvas"))).toBe(
    true,
  );
  expect(await area!.evaluate((node) => node === document.querySelector(".color-area"))).toBe(true);
});

test("reopening the picker restores its format and fields without changing the target", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  const toggle = page.getByRole("button", { name: "Open color picker" });
  await toggle.click();
  const format = page.getByRole("combobox", { name: "Color format", exact: true });
  const search = page.getByLabel("Search colors", { exact: true });
  await search.fill("#336699");
  for (const [mode, values] of [
    ["rgb", ["51", "102", "153"]],
    ["hsl", ["210", "50", "40"]],
    ["hsb", ["210", "66.7", "60"]],
    ["hex", ["#336699"]],
  ] as const) {
    await selectChoice(format, mode);
    for (const close of ["button", "escape"]) {
      if (close === "button")
        await page.getByRole("button", { name: "Close color picker" }).click();
      else await page.keyboard.press("Escape");
      await expect(page.locator(".color-picker")).toHaveCount(0);
      await toggle.click();
      await expect(format).toHaveJSProperty("value", mode);
      await expect(page.locator(".color-channels")).toHaveAttribute("data-format", mode);
      const fields = page.locator(".color-channels input");
      await expect(fields).toHaveCount(values.length);
      for (const [index, value] of values.entries())
        await expect(fields.nth(index)).toHaveValue(value);
      await expect(search).toHaveValue("#336699");
    }
  }
  await expect(page.locator(".selected-color strong")).toHaveText("H7");
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
});

test("partial HEX survives renders and the format menu supports keyboard navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  await page.getByRole("button", { name: "Open color picker" }).click();
  const hex = page.getByLabel("Hex color", { exact: true });
  const search = page.getByLabel("Search colors", { exact: true });
  await hex.fill("B23");
  await expect(search).toHaveValue("#BB2233");
  await hex.fill("#12");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(hex).toHaveValue("#12");
  await expect(hex).toBeFocused();
  await expect(search).toHaveValue("#BB2233");
  await hex.press("Tab");
  await expect(hex).toHaveValue("#BB2233");
  const format = page.getByRole("combobox", { name: "Color format", exact: true });
  await format.focus();
  await format.press("h");
  await expect(format).toBeFocused();
  await expect(page.getByRole("button", { name: "Pencil", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await selectChoice(format, "rgb");
  await selectChoice(page.getByRole("combobox", { name: "Language", exact: true }), "zh-CN");
  await page.getByRole("button", { name: "打开选色器", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "颜色格式", exact: true })).toHaveJSProperty(
    "value",
    "rgb",
  );
  await expect(page.getByLabel("红（0–255）", { exact: true })).toHaveValue("187");
});

test("visual values use the existing explained MARD search and require an explicit brush choice", async ({
  page,
}) => {
  await scene(page);
  const canvas = await page.locator(".pattern-canvas").elementHandle();
  const draft = await page.evaluate(() => localStorage.getItem("my-beads.draft"));
  const zoom = await page.getByLabel("Zoom level").textContent();
  await page.getByRole("spinbutton", { name: "Hue (degrees)", exact: true }).fill("60");
  await page.getByRole("spinbutton", { name: "Saturation (%)", exact: true }).fill("15.8");
  await page.getByRole("spinbutton", { name: "Brightness (%)", exact: true }).fill("29.8");
  await expect(page.getByLabel("Search colors", { exact: true })).toHaveValue("#4C4C40");
  const closest = page.getByRole("button", { name: "H5 #474747", exact: true });
  const chroma = page.getByRole("button", { name: "B23 #303921", exact: true });
  await expect(closest).toHaveAccessibleDescription(/Closest color/);
  await expect(chroma).toHaveAccessibleDescription(/Preserve chroma/);
  await expect(page.locator(".selected-color strong")).toHaveText("H7");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("my-beads.draft"))).toBe(draft);
  expect(await page.getByLabel("Zoom level").textContent()).toBe(zoom);
  expect(await canvas!.evaluate((node) => node === document.querySelector(".pattern-canvas"))).toBe(
    true,
  );
  await chroma.click();
  await expect(page.locator(".selected-color strong")).toHaveText("B23");
  await expect(page.locator(".color-picker")).toHaveCount(0);
  await page.getByRole("button", { name: "Open color picker" }).click();
  await page.getByLabel("Search colors", { exact: true }).fill("#fff");
  await expect(page.getByRole("spinbutton", { name: "Hue (degrees)", exact: true })).toHaveValue(
    "60",
  );
  await expect(page.getByRole("spinbutton", { name: "Saturation (%)", exact: true })).toHaveValue(
    "0",
  );
  await expect(page.locator(".palette-results")).toContainText("Exact match");
  await expect(page.getByRole("button", { name: "H2 #FFFFFF", exact: true })).toBeVisible();
});

test("dragging updates continuously, clamps outside the color area and survives theme changes", async ({
  page,
}) => {
  const area = await scene(page);
  await page.getByLabel("Search colors", { exact: true }).fill("#00ff00");
  const node = await area.elementHandle();
  const box = (await area.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByLabel("Search colors", { exact: true })).toHaveValue("#408040");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await node!.evaluate((el) => el === document.querySelector(".color-area"))).toBe(true);
  await page.mouse.move(box.x + box.width + 10, box.y - 10);
  await expect(page.getByLabel("Search colors", { exact: true })).toHaveValue("#00FF00");
  await page.mouse.move(box.x - 10, box.y + box.height + 10);
  await page.mouse.up();
  await expect(page.getByLabel("Search colors", { exact: true })).toHaveValue("#000000");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByLabel("Search colors", { exact: true })).toHaveValue("#000000");
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
});

test("capture loss stops the picker drag and a new drag remains usable", async ({ page }) => {
  const area = await scene(page);
  await page.getByLabel("Search colors", { exact: true }).fill("#00ff00");
  await area.evaluate((node) =>
    node.addEventListener("pointerdown", (event) => {
      node.setAttribute("data-test-pointer", String((event as PointerEvent).pointerId));
    }),
  );
  const box = (await area.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByLabel("Search colors", { exact: true })).toHaveValue("#408040");
  await area.evaluate((node) =>
    node.releasePointerCapture(Number(node.getAttribute("data-test-pointer"))),
  );
  await page.mouse.move(box.x + box.width - 1, box.y + 1);
  await page.mouse.up();
  await expect(page.getByLabel("Search colors", { exact: true })).toHaveValue("#408040");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole("spinbutton", { name: "Brightness (%)", exact: true })).toHaveValue(
    "50",
  );
});

test("picking after Canvas use moves keyboard focus into the picker without scrolling", async ({
  page,
}) => {
  const area = await scene(page);
  await page.getByLabel("Search colors", { exact: true }).fill("#00ff00");
  const canvas = page.locator(".pattern-canvas");
  await canvas.focus();
  await expect(canvas).toBeFocused();
  const draft = await page.evaluate(() => localStorage.getItem("my-beads.draft"));
  const before = (await area.boundingBox())!;
  await area.click({ position: { x: before.width / 2, y: before.height / 2 } });
  await expect(page.getByRole("slider", { name: "Adjust hue" })).toBeFocused();
  expect(await area.boundingBox()).toEqual(before);
  await expect(page.getByLabel("Search colors", { exact: true })).toHaveValue("#408040");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
  await page.keyboard.press("e");
  await expect(page.getByRole("button", { name: "Pencil", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await page.evaluate(() => localStorage.getItem("my-beads.draft"))).toBe(draft);
  await page.keyboard.press("Escape");
  await expect(page.locator(".color-picker")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open color picker" })).toBeFocused();
});

test("native keyboard controls preserve hue intent and partial values without invoking editor shortcuts", async ({
  page,
}) => {
  await scene(page);
  const hue = page.getByRole("slider", { name: "Adjust hue" });
  const saturation = page.getByRole("spinbutton", { name: "Saturation (%)", exact: true });
  const brightness = page.getByRole("spinbutton", { name: "Brightness (%)", exact: true });
  await brightness.fill("100");
  await saturation.fill("100");
  await hue.press("End");
  await expect(page.getByLabel("Search colors", { exact: true })).toHaveValue("#FF0000");
  await expect(page.getByRole("spinbutton", { name: "Hue (degrees)", exact: true })).toHaveValue(
    "360",
  );
  await hue.press("Home");
  await expect(page.getByRole("spinbutton", { name: "Hue (degrees)", exact: true })).toHaveValue(
    "0",
  );
  await saturation.fill("");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(saturation).toHaveValue("");
  await expect(saturation).toBeFocused();
  await saturation.press("Tab");
  await expect(saturation).toHaveValue("100");
  await brightness.fill("999");
  await expect(page.getByLabel("Search colors", { exact: true })).toHaveValue("#FF0000");
  await brightness.press("Escape");
  await expect(page.locator(".color-picker")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open color picker" })).toBeFocused();
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
});

for (const [width, height, locale] of [
  [320, 568, "en-US"],
  [390, 844, "zh-CN"],
  [900, 560, "zh-CN"],
] as const) {
  test(`picker and matches are reachable at ${width}x${height} in ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await selectChoice(page.getByRole("combobox", { name: "Language", exact: true }), locale);
    await page.locator(".blank-form button").click();
    await openPalette(page);
    await page.locator(".palette-search").fill("#4c4c40");
    await selectChoice(
      page.getByRole("combobox", { name: locale === "en-US" ? "Appearance" : "外观", exact: true }),
      "dark",
    );
    await page.locator(".color-picker-toggle").click();
    await expect(page.locator(".palette-panel")).toBeHidden();
    await expect(page.locator(".editor-dock")).toBeHidden();
    for (const format of ["hex", "rgb", "hsl", "hsb"]) {
      await selectChoice(page.locator(".color-format .select-trigger"), format);
      for (const field of await page.locator(".color-channels input").all()) {
        await field.scrollIntoViewIfNeeded();
        const bounds = (await field.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        await field.click();
        await expect(field).toBeFocused();
      }
    }
    const match = page.getByRole("button", { name: "B23 #303921", exact: true });
    await match.scrollIntoViewIfNeeded();
    const box = (await match.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(
      await match.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return node.contains(
          document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
        );
      }),
    ).toBe(true);
    await match.click();
    await expect(page.locator(".color-picker")).toHaveCount(0);
    await expect(page.locator(".palette-toggle")).toContainText("B23");
    await expect(page.locator(".pattern-canvas")).toBeFocused();
    await openPalette(page);
    await page.locator(".color-picker-toggle").click();
    await page.locator(".color-picker-close").click();
    await expect(page.locator(".color-picker")).toHaveCount(0);
    await expect(page.locator(".color-picker-toggle")).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
      true,
    );
  });
}

test.describe("touch color selection", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("taps pick a target without painting the Canvas", async ({ page }) => {
    const area = await scene(page, "#00ff00");
    await area.scrollIntoViewIfNeeded();
    const box = (await area.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    // Touch coordinates are rounded to device pixels; the sheet may have a fractional origin.
    for (const [name, span] of [
      ["Saturation (%)", box.width],
      ["Brightness (%)", box.height],
    ] as const)
      await expect
        .poll(async () =>
          Math.abs(
            Number(await page.getByRole("spinbutton", { name, exact: true }).inputValue()) - 50,
          ),
        )
        .toBeLessThanOrEqual(100 / span + 0.05);
    await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
    await expect(page.locator(".palette-toggle")).toContainText("H7");
  });
});

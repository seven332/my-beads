import { test, expect, type Page } from "@playwright/test";
import { openPalette } from "./helpers.js";

async function scene(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create blank grid" }).click();
  await openPalette(page);
  await page.getByRole("button", { name: "Open color picker" }).click();
  await expect(page.getByRole("slider", { name: "Adjust hue" })).toBeFocused();
  await expect(page.getByRole("slider", { name: "Adjust hue" })).toBeInViewport({ ratio: 1 });
  return page.locator(".color-area");
}

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
    await page.getByLabel("Language").selectOption(locale);
    await page.locator(".blank-form button").click();
    await openPalette(page);
    await page.locator(".color-picker-toggle").click();
    await page.locator(".palette-search").fill("#4c4c40");
    await page
      .getByLabel(locale === "en-US" ? "Appearance" : "外观", { exact: true })
      .selectOption("dark");
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
    await expect(match).toHaveAttribute("aria-pressed", "true");
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
    const area = await scene(page);
    await page.locator(".palette-search").fill("#00ff00");
    await area.scrollIntoViewIfNeeded();
    const box = (await area.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator(".palette-search")).toHaveValue("#408040");
    await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
    await expect(page.locator(".palette-toggle")).toContainText("H7");
  });
});

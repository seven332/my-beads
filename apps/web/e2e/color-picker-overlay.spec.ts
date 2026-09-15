import { test, expect, type Page } from "@playwright/test";
import { fitCoordinates, openPalette } from "./helpers.js";

async function create(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create blank grid" }).click();
}

async function open(page: Page) {
  await openPalette(page);
  await page.getByRole("button", { name: "Open color picker" }).click();
  await expect(page.getByRole("dialog", { name: "Find a color" })).toBeVisible();
}

async function withinViewport(page: Page) {
  await expect
    .poll(() =>
      page.locator(".color-picker").evaluate((node) => {
        const box = node.getBoundingClientRect();
        return (
          box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
        );
      }),
    )
    .toBe(true);
}

test("desktop picker leaves list geometry and scroll intact and keeps matches beside it", async ({
  page,
}) => {
  await create(page);
  const results = page.locator(".palette-results");
  const search = page.locator(".color-search-input");
  await results.evaluate((node) => {
    node.scrollTop = 700;
  });
  const before = { results: await results.boundingBox(), search: await search.boundingBox() };
  const zoom = await page.getByLabel("Zoom level").textContent();
  await page.locator(".color-picker-toggle").click();
  await withinViewport(page);
  expect(await results.boundingBox()).toEqual(before.results);
  expect(await search.boundingBox()).toEqual(before.search);
  expect(await results.evaluate((node) => node.scrollTop)).toBe(700);
  const picker = (await page.locator(".color-picker").boundingBox())!;
  expect(picker.x + picker.width).toBeLessThan(
    (await page.locator(".palette-panel").boundingBox())!.x,
  );
  await page.keyboard.press("Escape");
  expect(await results.evaluate((node) => node.scrollTop)).toBe(700);
  expect(await results.boundingBox()).toEqual(before.results);
  await page.locator(".color-picker-toggle").click();
  await page.getByLabel("Hex color", { exact: true }).fill("4c4c40");
  for (const code of ["H5 #474747", "B23 #303921"])
    await expect(page.getByRole("button", { name: code, exact: true })).toBeInViewport({
      ratio: 1,
    });
  await page.getByRole("button", { name: "B23 #303921", exact: true }).click();
  await expect(page.locator(".color-picker")).toHaveCount(0);
  await expect(page.locator(".selected-color strong")).toHaveText("B23");
  await expect(page.getByLabel("Zoom level")).toHaveText(zoom!);
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
});

for (const tool of ["Pencil", "Eraser"]) {
  test(`Canvas dismissal cannot start a ${tool} stroke`, async ({ page }) => {
    await create(page);
    const coordinates = await fitCoordinates(page, 50, 50);
    const point = coordinates.cell(10, 10);
    if (tool === "Eraser") await page.mouse.click(point.x, point.y);
    await page.getByRole("button", { name: tool, exact: true }).click();
    const before = await page.getByTestId("counts").textContent();
    await open(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 10, point.y);
    await page.mouse.up();
    await expect(page.locator(".color-picker")).toHaveCount(0);
    await expect(page.getByTestId("counts")).toHaveText(before!);
    await page.mouse.click(point.x, point.y);
    await expect(page.getByTestId("counts")).toHaveText(
      tool === "Pencil" ? "1 bead · 1 color" : "0 beads · 0 colors",
    );
  });
}

test.describe("simultaneous touches", () => {
  test.use({ hasTouch: true });
  for (const tool of ["Pencil", "Eraser"]) {
    test(`a secondary Canvas touch cannot use ${tool} or interrupt the picker drag`, async ({
      page,
      context,
      browserName,
    }) => {
      test.skip(browserName !== "chromium", "Native multi-touch injection requires Chromium CDP.");
      await create(page);
      const coordinates = await fitCoordinates(page, 50, 50);
      const point = coordinates.cell(10, 10);
      const second = { x: Math.round(point.x), y: Math.round(point.y), id: 2 };
      if (tool === "Eraser") await page.touchscreen.tap(second.x, second.y);
      await page.getByRole("button", { name: tool, exact: true }).click();
      const before = await page.getByTestId("counts").textContent();
      await open(page);
      await page.getByLabel("Hex color", { exact: true }).fill("00ff00");
      const area = (await page.locator(".color-area").boundingBox())!;
      const first = {
        x: Math.round(area.x + area.width / 2),
        y: Math.round(area.y + area.height / 2),
        id: 1,
      };
      const session = await context.newCDPSession(page);
      try {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [first],
        });
        const target = await page.locator(".palette-search").inputValue();
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [first, second],
        });
        await expect(page.getByTestId("counts")).toHaveText(before!);
        await expect(page.locator(".color-picker")).toBeVisible();
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ ...first, x: Math.round(area.x + area.width - 1) }, second],
        });
        await expect(page.locator(".palette-search")).not.toHaveValue(target);
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await expect(page.getByTestId("counts")).toHaveText(before!);
        await page.keyboard.press("Escape");
        await page.touchscreen.tap(second.x, second.y);
        await expect(page.getByTestId("counts")).toHaveText(
          tool === "Pencil" ? "1 bead · 1 color" : "0 beads · 0 colors",
        );
      } finally {
        await session.detach();
      }
    });
  }
});

test("outside control keeps its focus and action, while explicit Fit closes without focus theft", async ({
  page,
}) => {
  await create(page);
  await open(page);
  const title = page.locator(".title-input");
  await title.click();
  await expect(page.locator(".color-picker")).toHaveCount(0);
  await expect(title).toBeFocused();
  await title.fill("Color study");
  await open(page);
  await page.getByRole("button", { name: "Fit to window", exact: true }).click();
  await expect(page.locator(".color-picker")).toHaveCount(0);
  await expect(title).toHaveValue("Color study");
});

test("responsive modality changes preserve the same fields, incomplete target and keyboard focus", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await create(page);
  await open(page);
  const hex = page.getByLabel("Hex color", { exact: true });
  await hex.fill("4c4c40");
  await hex.fill("#12");
  const node = await hex.elementHandle();
  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [900, 560],
    [1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".color-picker")).toHaveAttribute(
      "data-compact",
      String(width <= 900),
    );
    await withinViewport(page);
    await expect(hex).toHaveValue("#12");
    await expect(hex).toBeFocused();
    expect(await node!.evaluate((el) => el === document.activeElement)).toBe(true);
    expect(await page.locator(".color-picker").evaluate((el) => el.matches(":modal"))).toBe(
      width <= 900,
    );
    await expect(page.locator(".color-area")).toHaveCount(1);
    await expect(page.locator(".palette-results")).toHaveCount(1);
    await expect(page.locator(".palette-search")).toHaveValue("#4C4C40");
  }
  await page.keyboard.press("Escape");
  await expect(page.locator(".color-picker-toggle")).toBeFocused();
  expect(errors).toEqual([]);
});

test("changing presentation cancels a captured color drag", async ({ page }) => {
  await create(page);
  await open(page);
  await page.getByLabel("Hex color", { exact: true }).fill("00ff00");
  const area = page.locator(".color-area");
  const box = (await area.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const target = await page.locator(".palette-search").inputValue();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".color-picker")).toHaveAttribute("data-compact", "true");
  await withinViewport(page);
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await expect(page.locator(".palette-search")).toHaveValue(target);
  await area.click();
  await expect(page.locator(".color-picker")).toBeVisible();
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
});

test("compact controls stay still when matching results change height", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await create(page);
  await open(page);
  await withinViewport(page);
  const area = page.locator(".color-area");
  const before = await area.boundingBox();
  for (const target of ["4c4c40", "ffffff", "336699", "000000"]) {
    await page.getByLabel("Hex color", { exact: true }).fill(target);
    await expect.poll(() => area.boundingBox()).toEqual(before);
  }
});

test("keyboard focus on Canvas cannot edit while the picker task is open", async ({ page }) => {
  await create(page);
  await open(page);
  await page.locator(".pattern-canvas").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.press("e");
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
  await expect(page.getByRole("button", { name: "Pencil", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".color-picker")).toHaveCount(0);
});

test("compact backdrop returns to the palette without changing the document", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await create(page);
  await open(page);
  await page.getByLabel("Hex color", { exact: true }).fill("4c4c40");
  await page.mouse.click(2, 2);
  await expect(page.locator(".color-picker")).toHaveCount(0);
  await expect(page.locator(".palette-panel")).toBeVisible();
  await expect(page.locator(".color-picker-toggle")).toBeFocused();
  await expect(page.getByTestId("counts")).toHaveText("0 beads · 0 colors");
  await page.locator(".color-picker-toggle").click();
  await expect(page.getByLabel("Hex color", { exact: true })).toHaveValue("#4C4C40");
});

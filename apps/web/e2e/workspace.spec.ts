import { test, expect, type Page } from "@playwright/test";
import { selectChoice, fitCoordinates, openPalette } from "./helpers.js";

async function importGrid(page: Page, csv: string) {
  await page.goto("/");
  await page
    .getByLabel("Open CSV")
    .setInputFiles({ name: "Workspace.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.locator(".title-input")).toHaveValue("Workspace");
}

async function fixedWorkspace(page: Page) {
  const size = page.viewportSize()!;
  const actual = await page.evaluate(() => {
    scrollTo(200, 200);
    const canvas = document.querySelector(".pattern-canvas")!.getBoundingClientRect();
    return {
      scroll: [scrollX, scrollY],
      page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      canvas: [canvas.x, canvas.y, canvas.width, canvas.height],
    };
  });
  expect(actual).toEqual({
    scroll: [0, 0],
    page: [size.width, size.height],
    canvas: [0, 0, size.width, size.height],
  });
}

async function controlsReachable(page: Page) {
  const controls = await page
    .locator(
      ".editor-topbar input, .editor-topbar select, .editor-topbar button, .tools button, .history-controls button, .editor-navigation button",
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return {
          label: node.getAttribute("aria-label") ?? node.textContent,
          hidden: r.width === 0 || r.height === 0,
          inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
          hit: node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
        };
      }),
    );
  for (const control of controls.filter((control) => !control.hidden)) {
    expect(control.inside, String(control.label)).toBe(true);
    expect(control.hit, String(control.label)).toBe(true);
  }
}

for (const [width, height] of [
  [1440, 900],
  [1280, 720],
  [390, 844],
  [844, 390],
  [320, 390],
]) {
  test(`workspace and fitted pattern remain visible at ${width}x${height} in both languages`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await importGrid(
      page,
      Array.from({ length: 50 }, () => Array(50).fill("H7").join(",")).join("\n"),
    );
    for (const locale of ["en-US", "zh-CN"]) {
      await selectChoice(page.locator(".language-picker .select-trigger"), locale);
      await page
        .locator(".title-input")
        .fill("A long pattern title / 标题很长的拼豆图纸 / ".repeat(3).slice(0, 100));
      const { cell, zoom } = await fitCoordinates(page, 50, 50);
      await fixedWorkspace(page);
      await controlsReachable(page);
      if (await page.locator(".palette-toggle").isVisible()) {
        const dock = (await page.locator(".editor-dock").boundingBox())!;
        const status = (await page.locator(".editor-status").boundingBox())!;
        expect(dock.height).toBeLessThanOrEqual(112);
        expect(status.y + status.height).toBeLessThan(dock.y);
        for (const selector of [".editor-tools", ".editor-navigation"]) {
          const row = (await page.locator(selector).boundingBox())!;
          expect(row.x).toBeGreaterThanOrEqual(dock.x);
          expect(row.y).toBeGreaterThanOrEqual(dock.y);
          expect(row.x + row.width).toBeLessThanOrEqual(dock.x + dock.width);
          expect(row.y + row.height).toBeLessThanOrEqual(dock.y + dock.height);
        }
      }
      const corners = [cell(0, 0), cell(49, 0), cell(0, 49), cell(49, 49)];
      for (const point of corners) {
        expect(
          await page.evaluate(
            (p) => document.elementFromPoint(p.x, p.y)?.matches(".pattern-canvas"),
            point,
          ),
        ).toBe(true);
        await expect
          .poll(() =>
            page.locator(".pattern-canvas").evaluate((node, p) => {
              const canvas = node as HTMLCanvasElement,
                rect = canvas.getBoundingClientRect();
              const [r, g, b, alpha] = canvas
                .getContext("2d")!
                .getImageData(
                  Math.floor((p.x * canvas.width) / rect.width),
                  Math.floor((p.y * canvas.height) / rect.height),
                  1,
                  1,
                ).data;
              // Fractional cells below two pixels can antialias at the grid boundary.
              return r === 0 && g === 0 && b === 0 && alpha >= 200;
            }, point),
          )
          .toBe(true);
      }
      // Assert the whole fitted grid, not just its center, misses every visible panel.
      const grid = {
        left: corners[0].x - zoom / 2,
        top: corners[0].y - zoom / 2,
        right: corners[3].x + zoom / 2,
        bottom: corners[3].y + zoom / 2,
      };
      expect(
        await page.locator("[data-canvas-panel]").evaluateAll(
          (nodes, grid) =>
            nodes.every((node) => {
              const r = node.getBoundingClientRect();
              return (
                r.width === 0 ||
                r.height === 0 ||
                r.right <= grid.left ||
                r.left >= grid.right ||
                r.bottom <= grid.top ||
                r.top >= grid.bottom
              );
            }),
          grid,
        ),
      ).toBe(true);
    }
  });
}

test("compact dock uses the minimum width for one row or its widest wrapped row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await importGrid(page, "M12,M12");
  await openPalette(page);
  await page.locator('.palette-grid button[aria-label^="M12 "]').click();
  await page.keyboard.press("Escape");
  const dock = page.locator(".editor-dock");
  const geometry = () =>
    dock.evaluate((element) => {
      const style = getComputedStyle(element);
      const row = (selector: string) => {
        const node = element.querySelector(selector)!;
        const rect = node.getBoundingClientRect();
        return { width: rect.width, left: rect.left, right: rect.right };
      };
      const tools = row(".editor-tools");
      const navigation = row(".editor-navigation");
      const inset =
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight) +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.borderRightWidth);
      const single = tools.width + navigation.width + parseFloat(style.columnGap) + inset;
      const wrapped = element.hasAttribute("data-wrapped");
      const box = element.getBoundingClientRect();
      return {
        wrapped,
        single,
        width: box.width,
        expectedWidth: wrapped ? Math.max(tools.width, navigation.width) + inset : single,
        inside: [tools, navigation].every((r) => r.left >= box.left && r.right <= box.right),
        dividers: [".history-controls", ".display-controls", ".zoom-controls"].map(
          (selector) => getComputedStyle(element.querySelector(selector)!).borderLeftWidth,
        ),
        rowDivider: getComputedStyle(element.querySelector(".editor-navigation")!, "::before")
          .content,
      };
    });
  for (const locale of ["en-US", "zh-CN"]) {
    await page.setViewportSize({ width: 768, height: 1024 });
    await selectChoice(page.locator(".language-picker .select-trigger"), locale);
    await expect(dock).not.toHaveAttribute("data-wrapped");
    const minimum = (await geometry()).single + 24;
    for (const [width, wrapped] of [
      [Math.floor(minimum) - 1, true],
      [Math.ceil(minimum) + 1, false],
      [390, true],
      [320, true],
      [844, false],
    ] as const) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 1024 });
      await expect.poll(async () => (await geometry()).wrapped).toBe(wrapped);
      const actual = await geometry();
      expect(Math.abs(actual.width - actual.expectedWidth), `${locale} at ${width}px`).toBeLessThan(
        0.1,
      );
      expect(actual.inside).toBe(true);
      expect(actual.dividers).toEqual(["0px", "0px", "0px"]);
      expect(actual.rowDivider).toBe("none");
      await fixedWorkspace(page);
      await controlsReachable(page);
    }
  }
});

for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [320, 390],
]) {
  test(`palette scrolling and selection stay separate from the canvas at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await importGrid(page, "H7,H2");
    const { cell } = await fitCoordinates(page, 2, 1);
    const zoom = await page.getByLabel("Zoom level").textContent();
    await openPalette(page);
    await expect(page.locator(".palette-grid .color").first()).toBeInViewport();
    const panel = page.locator(".palette-panel");
    await panel.evaluate((element) =>
      element.addEventListener("wheel", () => element.setAttribute("data-wheel-seen", "true")),
    );
    const canvas = page.locator(".pattern-canvas");
    await canvas.evaluate((element) =>
      element.addEventListener("wheel", () => element.setAttribute("data-wheel-seen", "true")),
    );
    const last = page.locator(".palette-grid .color").last();
    const code = (await last.getAttribute("aria-label"))!.split(" ")[0];
    await last.click();
    await expect(page.locator(".selected-color strong")).toHaveText(code);
    await expect(page.getByTestId("counts")).toHaveText("2 beads · 2 colors");
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
    await page.mouse.wheel(0, 800);
    await expect(panel).toHaveAttribute("data-wheel-seen", "true");
    await expect(canvas).not.toHaveAttribute("data-wheel-seen", "true");
    await fixedWorkspace(page);
    await expect(page.getByLabel("Zoom level")).toHaveText(zoom!);
    if (await page.locator(".palette-toggle").isVisible()) {
      await page.keyboard.press("Escape");
      await openPalette(page);
      await expect(page.locator(".palette-search")).toBeFocused();
      await expect(page.locator(".palette-search")).toBeInViewport({ ratio: 1 });
      await fixedWorkspace(page);
    }
    await page.locator(".palette-search").fill("#4c4c40");
    await expect(page.locator(".color-recommendation")).toHaveCount(2);
    await page.getByRole("button", { name: "B23 #303921", exact: true }).click();
    await expect(page.locator(".selected-color strong")).toHaveText("B23");
    if (await page.locator(".palette-toggle").isVisible()) {
      await page.keyboard.press("Escape");
      await expect(page.locator(".palette-toggle")).toBeFocused();
      await expect(panel).not.toBeVisible();
      await expect(page.getByLabel("Zoom level")).toHaveText(zoom!);
    }
    await page.mouse.click(cell(1, 0).x, cell(1, 0).y);
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
    // Opening and closing the palette did not shift the cell underneath the pointer.
    await page.getByRole("button", { name: "Eyedropper", exact: true }).click();
    await page.mouse.click(cell(1, 0).x, cell(1, 0).y);
    await expect(page.locator(".selected-color strong")).toHaveText("B23");
    await openPalette(page);
    await page.getByRole("button", { name: "Fit to window", exact: true }).click();
    if (await page.locator(".palette-toggle").isVisible()) await expect(panel).not.toBeVisible();
    await fixedWorkspace(page);
  });
}

test("draft recovery warnings leave drawing and export controls reachable in a short window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 390 });
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("my-beads.draft", '{"version":99}'));
  await page.reload();
  await page.getByRole("button", { name: "Create blank grid" }).click();
  await expect(page.getByLabel("Draft status")).toContainText("unsupported version");
  await fixedWorkspace(page);
  await controlsReachable(page);
  await page.getByRole("button", { name: "Replace saved draft" }).click();
  await expect(page.getByLabel("Draft status")).toContainText("saved on this device");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export pattern" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeFocused();
});

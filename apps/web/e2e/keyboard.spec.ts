import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parsePatternCsv } from "@my-beads/core";
import { selectChoice, fitCoordinates, openExport, openPalette } from "./helpers.js";

async function scene(page: Page, csv = "H2,H2,H2,H2") {
  await page.goto("/");
  await page
    .getByLabel("Open CSV")
    .setInputFiles({ name: "keys.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByLabel("Pattern title")).toHaveValue("keys");
  const grid = parsePatternCsv(csv);
  const coords = await fitCoordinates(page, grid[0].length, grid.length);
  const canvas = page.getByRole("img", { name: "Pattern canvas" });
  await canvas.focus();
  return { canvas, ...coords };
}
async function exportedGrid(page: Page) {
  await openExport(page);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  return parsePatternCsv(await readFile((await (await pending).path())!, "utf8"));
}

test("tool and view shortcuts dispatch immediately, preserve history, and Enter edits the selected cell", async ({
  page,
}) => {
  const { canvas } = await scene(page);
  for (const [key, tool] of [
    ["e", "Eraser"],
    ["b", "Paint bucket"],
    ["i", "Eyedropper"],
    ["h", "Pan"],
    ["p", "Pencil"],
  ]) {
    await page.keyboard.press(key);
    await expect(page.getByRole("button", { name: tool, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  for (const [key, name] of [
    ["g", "Grid"],
    ["c", "Codes"],
  ]) {
    const button = page.getByRole("button", { name, exact: true });
    const before = await button.getAttribute("aria-pressed");
    await page.keyboard.press(key);
    await expect(button).toHaveAttribute("aria-pressed", String(before !== "true"));
    await page.keyboard.press(key);
    await expect(button).toHaveAttribute("aria-pressed", before!);
  }
  const level = page.getByLabel("Zoom level");
  const fit = await level.textContent();
  await page.keyboard.press("-");
  await expect(level).not.toHaveText(fit!);
  await page.keyboard.press("+");
  await expect(level).toHaveText(fit!);
  await page.keyboard.press("-");
  await page.keyboard.press("Shift+1");
  await expect(level).toHaveText(fit!);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("counts")).toHaveText("4 beads · 2 colors");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("counts")).toHaveText("4 beads · 1 color");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByTestId("counts")).toHaveText("4 beads · 2 colors");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("e");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("counts")).toHaveText("3 beads · 2 colors");
  await expect(canvas).toBeFocused();
  expect(await exportedGrid(page)).toEqual([["H7", null, "H2", "H2"]]);
});

test("Space pans with either release order, preserves the selected tool and creates no edit", async ({
  page,
}) => {
  const { canvas, center } = await scene(page);
  await page.keyboard.press("e");
  const idle = await canvas.evaluate((node) => getComputedStyle(node).cursor);
  for (const keyFirst of [true, false]) {
    await page.keyboard.down("Space");
    await expect(canvas).toHaveCSS("cursor", "grab");
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await expect(canvas).toHaveCSS("cursor", "grabbing");
    await page.mouse.move(center.x + 16, center.y + 8);
    if (keyFirst) {
      await page.keyboard.up("Space");
      await expect(canvas).toHaveCSS("cursor", "grabbing");
      await page.mouse.move(center.x + 32, center.y + 16);
      await page.mouse.up();
    } else {
      await page.mouse.up();
      await expect(canvas).toHaveCSS("cursor", "grab");
      // The same held key can start a second pan.
      await page.mouse.down();
      await expect(canvas).toHaveCSS("cursor", "grabbing");
      await page.mouse.up();
      await page.keyboard.up("Space");
    }
    await expect(canvas).toHaveCSS("cursor", idle);
    await expect(page.getByRole("button", { name: "Eraser", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  expect(await exportedGrid(page)).toEqual([["H2", "H2", "H2", "H2"]]);
});

test("Space during a stroke arms the next pan without changing the current gesture or undo boundary", async ({
  page,
}) => {
  const { canvas, cell } = await scene(page);
  await page.mouse.move(cell(0, 0).x, cell(0, 0).y);
  await page.mouse.down();
  await page.keyboard.down("Space");
  await page.keyboard.press("e");
  await page.keyboard.press("g");
  await page.keyboard.press("?");
  await page.keyboard.press("ControlOrMeta+z");
  await page.mouse.move(cell(2, 0).x, cell(2, 0).y);
  await expect(page.getByRole("button", { name: "Pencil", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Grid", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(canvas).not.toHaveCSS("cursor", "grabbing");
  await page.mouse.up();
  await expect(canvas).toHaveCSS("cursor", "grab");
  await page.mouse.down();
  await expect(canvas).toHaveCSS("cursor", "grabbing");
  await page.mouse.move(cell(3, 0).x, cell(3, 0).y);
  await page.mouse.up();
  await page.keyboard.up("Space");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("counts")).toHaveText("4 beads · 1 color");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await exportedGrid(page)).toEqual([["H7", "H7", "H7", "H2"]]);
});

test("interrupted Space pans clear the override before another gesture", async ({ page }) => {
  const { canvas, center } = await scene(page);
  const idle = await canvas.evaluate((node) => getComputedStyle(node).cursor);
  await canvas.evaluate((element) =>
    element.addEventListener("pointerdown", (event) => {
      element.setAttribute("data-pointer-id", String((event as PointerEvent).pointerId));
    }),
  );
  for (const termination of [
    "pointercancel",
    "lost-pressed",
    "escape",
    "canvas-blur",
    "window-blur",
    "hidden",
  ]) {
    await canvas.focus();
    await page.keyboard.down("Space");
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await expect(canvas).toHaveCSS("cursor", "grabbing");
    if (termination === "escape") await page.keyboard.press("Escape");
    else if (termination === "canvas-blur")
      await canvas.evaluate((node) => (node as HTMLElement).blur());
    else if (termination === "window-blur")
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else if (termination === "hidden")
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
        Reflect.deleteProperty(document, "hidden");
      });
    else
      await canvas.evaluate(
        (node, termination) =>
          node.dispatchEvent(
            new PointerEvent(
              termination === "pointercancel" ? "pointercancel" : "lostpointercapture",
              { pointerId: Number(node.getAttribute("data-pointer-id")), buttons: 1 },
            ),
          ),
        termination,
      );
    await expect(canvas).toHaveCSS("cursor", idle);
    await page.mouse.up();
    await page.keyboard.up("Space");
  }
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await canvas.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("counts")).toHaveText("4 beads · 2 colors");
});

test("inputs and native buttons retain their keys, including composition and browser modifiers", async ({
  page,
}) => {
  const { canvas, center } = await scene(page);
  await openPalette(page);
  const search = page.getByLabel("Search colors");
  await search.fill("pegichb");
  await search.press("Space");
  await expect(search).toHaveValue("pegichb ");
  await expect(page.getByRole("button", { name: "Pencil", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await canvas.focus();
  const prevented = await canvas.evaluate((node) => {
    const events = [
      { key: "e", isComposing: true },
      { key: "e", keyCode: 229 },
      { key: "e", altKey: true },
      { key: "e", metaKey: true },
      { key: "e", ctrlKey: true },
    ];
    return events.map((options) => {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...options });
      node.dispatchEvent(event);
      return event.defaultPrevented;
    });
  });
  expect(prevented).toEqual([false, false, false, false, false]);
  const eraser = page.getByRole("button", { name: "Eraser", exact: true });
  await eraser.focus();
  await eraser.press("Space");
  await expect(eraser).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.down("Space");
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await expect(canvas).toHaveCSS("cursor", "grabbing");
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

test("Shift+2 fits a nonempty highlighted color and otherwise preserves view and palette", async ({
  page,
}) => {
  const csv = Array.from({ length: 100 }, (_, x) => (x >= 40 && x <= 42 ? "H7" : "H2")).join(",");
  const { canvas } = await scene(page, csv);
  const level = page.getByLabel("Zoom level"),
    before = await level.textContent();
  await page.keyboard.press("Shift+2");
  await expect(level).toHaveText(before!);
  await page.getByRole("button", { name: "Locate H7 on canvas" }).click();
  await canvas.press("Shift+2");
  await expect(level).toHaveText("267%");
  await expect(page.locator(".highlight-summary")).toHaveText("Highlighting H7 · 3 beads");
  await page.keyboard.press("Shift+1");
  await expect(level).toHaveText(before!);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

test("help is bilingual, modal and usable in narrow windows, restoring keyboard and button focus", async ({
  page,
}) => {
  const { canvas } = await scene(page);
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Close keyboard shortcuts" })).toBeFocused();
  await expect(dialog).toContainText("Fit highlighted color");
  await page.keyboard.press("e");
  await page.keyboard.press("g");
  await expect(page.getByRole("button", { name: "Pencil", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Grid", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Tab");
  // Native modal traversal may leave focus on the body/browser chrome, never the editor.
  expect(
    await dialog.evaluate(
      (node) => document.activeElement === document.body || node.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(canvas).toBeFocused();
  for (const locale of ["en-US", "zh-CN"]) {
    await selectChoice(page.locator(".language-picker .select-trigger"), locale);
    await page.setViewportSize({ width: 320, height: 390 });
    const help = page.locator(".keyboard-help-button");
    await help.click();
    await expect(page.locator(".keyboard-dialog")).toBeVisible();
    await expect(page.locator(".keyboard-dialog h2")).toHaveText(
      locale === "en-US" ? "Keyboard shortcuts" : "键盘快捷键",
    );
    const geometry = await page.locator(".keyboard-dialog").evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        inside:
          rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        overflow: node.scrollWidth > node.clientWidth,
      };
    });
    expect(geometry).toEqual({ inside: true, overflow: false });
    await page.locator(".keyboard-heading button").click();
    await expect(help).toBeFocused();
  }
});

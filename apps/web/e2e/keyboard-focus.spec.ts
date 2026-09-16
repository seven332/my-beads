import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { sampleWebp } from "./fixtures.js";
import {
  continueEditing,
  fitCoordinates,
  openExport,
  openPalette,
  selectChoice,
  startNew,
} from "./helpers.js";

for (const entry of ["blank", "csv", "image", "resume", "draft"]) {
  test(`${entry} entry focuses Canvas for immediate Space panning`, async ({ page }) => {
    await page.goto("/");
    if (entry === "csv") {
      await page
        .getByLabel("Open CSV")
        .setInputFiles({
          name: "Entry.csv",
          mimeType: "text/csv",
          buffer: Buffer.from("H2,H2,H2,H2"),
        });
    } else if (entry === "image") {
      await page
        .getByLabel("Open image", { exact: true })
        .setInputFiles({ name: "Entry.webp", mimeType: "image/webp", buffer: sampleWebp });
      await page.getByRole("button", { name: "Apply image", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Create blank grid", exact: true }).click();
      if (entry === "resume") {
        await startNew(page);
        await continueEditing(page);
      }
      if (entry === "draft") await page.reload();
    }
    const canvas = page.locator(".pattern-canvas");
    await expect(canvas).toBeFocused();
    const title = await page.getByLabel("Pattern title").inputValue();
    const counts = await page.getByTestId("counts").textContent();
    await canvas.hover();
    await page.keyboard.down("Space");
    await expect(canvas).toHaveCSS("cursor", "grab");
    await page.mouse.down();
    await expect(canvas).toHaveCSS("cursor", "grabbing");
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2 + 64, box.y + box.height / 2);
    await page.mouse.up();
    await page.keyboard.up("Space");
    await expect(page.getByLabel("Pattern title")).toHaveValue(title);
    await expect(page.getByTestId("counts")).toHaveText(counts!);
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  });
}

for (const control of ["title", "search", "appearance", "language"] as const) {
  for (const keyFirst of [false, true]) {
    test(`${control}: Space ${keyFirst ? "before" : "after"} returning to Canvas pans without painting`, async ({
      page,
    }) => {
      await page.goto("/");
      await page
        .getByLabel("Open CSV")
        .setInputFiles({
          name: "Focus.csv",
          mimeType: "text/csv",
          buffer: Buffer.from("H2,H2,H2,H2"),
        });
      const { cell, zoom } = await fitCoordinates(page, 4, 1);
      const canvas = page.locator(".pattern-canvas");
      const field =
        control === "search" ? page.getByLabel("Search colors") : page.getByLabel("Pattern title");
      if (control === "title") await field.fill("Focus title");
      else if (control === "search") {
        await openPalette(page);
        await field.fill("H2");
      } else {
        await selectChoice(
          page.getByRole("combobox", {
            name: control === "appearance" ? "Appearance" : "Language",
            exact: true,
          }),
          control === "appearance" ? "dark" : "en-US",
        );
      }
      const beforeTitle = await page.getByLabel("Pattern title").inputValue();
      if (keyFirst) await page.keyboard.down("Space");
      const position = cell(2, 0);
      await page.mouse.move(position.x, position.y);
      if (!keyFirst) await page.keyboard.down("Space");
      await expect(canvas).toBeFocused();
      await expect(canvas).toHaveCSS("cursor", "grab");
      if (control === "title" || control === "search")
        await expect(field).toHaveValue(
          (control === "title" ? "Focus title" : "H2") + (keyFirst ? " " : ""),
        );
      else await expect(page.locator('[role="combobox"][aria-expanded="true"]')).toHaveCount(0);
      await page.mouse.down();
      await expect(canvas).toHaveCSS("cursor", "grabbing");
      await page.mouse.move(position.x + zoom, position.y);
      // Releasing Space first must not turn this pan into a pencil stroke.
      await page.keyboard.up("Space");
      await expect(canvas).toHaveCSS("cursor", "grabbing");
      await page.mouse.up();
      await expect(page.getByTestId("counts")).toHaveText("4 beads · 1 color");
      await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Pencil", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.getByLabel("Pattern title")).toHaveValue(
        beforeTitle + (keyFirst && control === "title" ? " " : ""),
      );
      // Moving the view one cell right means the original column 3 now targets column 2.
      await page.mouse.click(position.x, position.y);
      await openExport(page);
      const pending = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download", exact: true }).click();
      expect(await readFile((await (await pending).path())!, "utf8")).toBe("H2,H7,H2,H2\n");
    });
  }
}

test("a stationary pointer preserves text and combobox keys; hovering alone does not move focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create blank grid", exact: true }).click();
  const canvas = page.locator(".pattern-canvas");
  await canvas.hover();
  const title = page.getByLabel("Pattern title");
  await title.focus();
  await title.fill("Typing");
  await page.keyboard.press("Space");
  await expect(title).toHaveValue("Typing ");
  await expect(title).toBeFocused();
  await expect(canvas).not.toHaveCSS("cursor", "grab");
  const appearance = page.getByRole("combobox", { name: "Appearance", exact: true });
  await appearance.focus();
  await page.keyboard.press("Space");
  await expect(appearance).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await title.focus();
  await canvas.hover();
  await expect(title).toBeFocused();
  await expect(canvas).not.toHaveCSS("cursor", "grab");
});

import { test, expect } from "@playwright/test";
import { ordinaryImageWorkflow, richImage } from "./ordinary-image-helpers.js";
import { selectChoice } from "./helpers.js";

test("converts a color-rich image with linked dimensions and exports a bounded MARD palette", async ({
  page,
}) => {
  await page.goto("/");
  await ordinaryImageWorkflow(page);
});

test("keeps large pixel mapping lists bounded and searchable, including after a correctable error", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Open image", { exact: true })
    .setInputFiles({ name: "Gradient.png", mimeType: "image/png", buffer: richImage() });
  const dialog = page.getByRole("dialog");
  await selectChoice(dialog.getByRole("combobox", { name: "Image processing" }), "pixel");
  await expect(dialog.locator(".mapping-row")).toHaveCount(100);
  await dialog.getByLabel("Distinct assignments").check();
  await expect(dialog.getByRole("alert")).toContainText("Increase the color limit");
  await expect(dialog.getByRole("button", { name: "Apply image" })).toBeDisabled();
  const hex = await dialog.locator(".mapping-row strong").first().textContent();
  await dialog.getByLabel("Find source color").fill(hex!);
  await expect(dialog.locator(".mapping-row")).toHaveCount(1);
  await dialog.getByLabel("Distinct assignments").uncheck();
  await expect(dialog.getByRole("button", { name: "Apply image" })).toBeEnabled();
});

test("decodes JPEG EXIF orientation before deriving grid dimensions", async ({ page }) => {
  await page.goto("/");
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 40;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "black";
    context.fillRect(0, 0, 40, 40);
    context.fillStyle = "white";
    context.fillRect(40, 0, 40, 40);
    return canvas.toDataURL("image/jpeg", 1).split(",")[1];
  });
  const jpeg = Buffer.from(encoded, "base64");
  // APP1, big-endian TIFF, one orientation tag (6: rotate 90 degrees clockwise).
  const exif = Buffer.from(
    "ffe100224578696600004d4d002a00000008000101120003000000010006000000000000",
    "hex",
  );
  const oriented = Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]);
  await page
    .getByLabel("Open image", { exact: true })
    .setInputFiles({ name: "Portrait.jpg", mimeType: "image/jpeg", buffer: oriented });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Target columns")).toHaveValue("25");
  await expect(dialog.getByLabel("Target rows")).toHaveValue("50");
  await expect(dialog.getByRole("button", { name: "Apply image" })).toBeEnabled();
  const edges = await dialog
    .getByRole("img", { name: "MARD preview" })
    .evaluate((node: HTMLCanvasElement) => {
      const ctx = node.getContext("2d")!;
      return [
        ctx.getImageData(0, 0, 1, 1).data[0],
        ctx.getImageData(0, node.height - 1, 1, 1).data[0],
      ];
    });
  expect(edges).toEqual([0, 255]);
  await dialog.getByRole("button", { name: "Apply image" }).click();
  await expect(page.getByLabel("Pattern title")).toHaveValue("Portrait");
});

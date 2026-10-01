import { expect, type Page } from "@playwright/test";

/** Probe real support independently: a renderer bug must not be mistaken for an unsupported GPU. */
export async function supportsWebGL(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  });
}

export async function openPreview(page: Page, supported: boolean) {
  await page.getByRole("button", { name: "3D preview", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "3D preview", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".preview-stage")).toHaveAttribute(
    "data-status",
    supported ? "ready" : "failed",
  );
  return dialog;
}

export async function checkBuiltPreview(page: Page) {
  const supported = await supportsWebGL(page);
  const dialog = await openPreview(page, supported);
  if (supported) {
    const shadows = dialog.getByRole("button", { name: "Cast shadows", exact: true });
    await expect(shadows).toHaveAttribute("aria-pressed", "false");
    if (await shadows.isEnabled()) {
      await shadows.click();
      await expect(shadows).toHaveAttribute("aria-pressed", "true");
    }
    await dialog.getByRole("button", { name: "Rotate left" }).click();
    await dialog.getByRole("button", { name: "Fused", exact: true }).click();
    await expect(dialog.getByRole("img", { name: "3D fused artwork preview" })).toBeVisible();
    await dialog.getByRole("button", { name: "On board", exact: true }).click();
    await dialog.getByRole("button", { name: "Reset view" }).click();
  } else await expect(dialog.getByRole("alert")).toContainText("keep editing");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "3D preview", exact: true })).toBeFocused();
}

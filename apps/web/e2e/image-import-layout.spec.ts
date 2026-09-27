import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";

type GatedWindow = Window & { imageConversionGate?: { readonly pending: number; release(): void } };

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 600 },
  { width: 844, height: 390 },
]) {
  for (const target of ["trigger", "option"] as const) {
    test(`preview completion preserves a pressed ${target} at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      // Hold delivery, not conversion output: releasing still runs the real image Worker.
      await page.addInitScript(() => {
        const post = Worker.prototype.postMessage;
        const pending: Array<() => void> = [];
        let released = false;
        Worker.prototype.postMessage = function (
          message: unknown,
          options?: Transferable[] | StructuredSerializeOptions,
        ) {
          const send = () => Reflect.apply(post, this, [message, options]);
          if (released) send();
          else pending.push(send);
        };
        (window as GatedWindow).imageConversionGate = {
          get pending() {
            return pending.length;
          },
          release() {
            released = true;
            for (const send of pending.splice(0)) send();
          },
        };
      });
      await page.goto("/");
      const png = new PNG({ width: 2, height: 1 });
      png.data.set([0, 0, 0, 255, 255, 255, 255, 255]);
      await page
        .getByLabel("Open image", { exact: true })
        .setInputFiles({ name: "colors.png", mimeType: "image/png", buffer: PNG.sync.write(png) });
      await page.waitForFunction(() => (window as GatedWindow).imageConversionGate?.pending === 1);
      const dialog = page.getByRole("dialog");
      const trigger = dialog.getByRole("combobox", { name: "Image processing" });
      const option = page.getByRole("option", { name: "Preserve pixels", exact: true });
      if (target === "option") await trigger.click();
      const control = target === "trigger" ? trigger : option;
      const before = (await control.boundingBox())!;
      const contentWidth = await dialog.evaluate((element) => element.clientWidth);
      await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
      await page.mouse.down();
      await page.evaluate(() => (window as GatedWindow).imageConversionGate!.release());
      await expect(dialog.getByRole("img", { name: "MARD preview" })).toBeVisible();
      // Keep the pointer where the user pressed; a second locator click would hide the race.
      const after = (await control.boundingBox())!;
      expect(Math.abs(after.x - before.x)).toBeLessThan(1);
      expect(Math.abs(after.y - before.y)).toBeLessThan(1);
      expect(await dialog.evaluate((element) => element.clientWidth)).toBe(contentWidth);
      await page.mouse.up();
      if (target === "trigger") {
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await option.click();
      }
      await expect(trigger).toHaveJSProperty("value", "pixel");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(dialog.getByLabel("Map #000000", { exact: true })).toBeVisible();
      const apply = dialog.getByRole("button", { name: "Apply image" });
      await expect(apply).toBeEnabled();
      await apply.click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("img", { name: "Pattern canvas" })).toBeVisible();
    });
  }
}

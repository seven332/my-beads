import { test, expect } from "@playwright/test";

for (const [system, saved, effective] of [
  ["dark", null, "dark"],
  ["light", "dark", "dark"],
  ["dark", "light", "light"],
  ["dark", "invalid", "dark"],
] as const) {
  test(`initial theme is ${effective} before main loads (OS ${system}, saved ${saved})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: system });
    await page.addInitScript((saved) => {
      if (saved !== null) localStorage.setItem("my-beads.theme", saved);
    }, saved);
    // Leave HTML, inline bootstrap and CSS real; block only the application bundle.
    await page.route("**/assets/*.js", (route) => route.abort());
    await page.goto("./");
    await expect(page.locator("#app")).toBeEmpty();
    await expect(page.locator("html")).toHaveAttribute("data-theme", effective);
    await expect(page.locator("html")).toHaveCSS("color-scheme", effective);
    await expect(page.locator("html")).toHaveCSS(
      "background-color",
      effective === "dark" ? "rgb(25, 29, 27)" : "rgb(244, 243, 239)",
    );
  });
}

test("denied storage still initializes the system theme before main loads", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Denied", "SecurityError");
      },
    });
  });
  await page.route("**/assets/*.js", (route) => route.abort());
  await page.goto("./");
  await expect(page.locator("#app")).toBeEmpty();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
});

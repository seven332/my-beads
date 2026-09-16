import { test } from "@playwright/test";
import { ordinaryImageWorkflow } from "../ordinary-image-helpers.js";

test("loads the conversion Worker from the repository deployment path", async ({ page }) => {
  await page.goto("./");
  await ordinaryImageWorkflow(page);
});

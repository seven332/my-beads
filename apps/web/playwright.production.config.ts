import { defineConfig } from "@playwright/test";
import development from "./playwright.config.js";

export default defineConfig({
  ...development,
  testDir: "./e2e/production",
  testIgnore: [],
  use: { ...development.use, baseURL: "http://127.0.0.1:4174/my-beads/" },
  webServer: {
    command: "pnpm exec vite preview --host 127.0.0.1 --port 4174 --strictPort --base /my-beads/",
    url: "http://127.0.0.1:4174/my-beads/",
    reuseExistingServer: false,
  },
});

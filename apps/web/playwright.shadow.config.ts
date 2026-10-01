import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./benchmarks",
  testMatch: "shadows.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  outputDir: "./test-results/shadows",
  reporter: "list",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL: "http://127.0.0.1:4176",
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: {
    command: "pnpm dev --port 4176 --strictPort",
    url: "http://127.0.0.1:4176",
    reuseExistingServer: false,
  },
});

import { defineConfig } from "@playwright/test";
import production from "./playwright.production.config.js";

export default defineConfig({
  ...production,
  testDir: "./benchmarks",
  testMatch: "preview.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Completion ceiling for 72 paced gestures on dense boards with software WebGL.
  // This opt-in runner has no latency SLO; ordinary browser-test timeouts are unchanged.
  timeout: 900_000,
  outputDir: "./test-results/benchmark",
  reporter: "list",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: { ...production.use, trace: "off", video: "off", screenshot: "off", deviceScaleFactor: 1 },
});

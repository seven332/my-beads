import { defineConfig } from "@playwright/test";
import benchmark from "./playwright.benchmark.config.js";

export default defineConfig({
  ...benchmark,
  testMatch: "fused.spec.ts",
  outputDir: "./test-results/fused",
});

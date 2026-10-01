import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, release, arch, totalmem } from "node:os";
import { fileURLToPath } from "node:url";
import { installPreviewProbe } from "./probe.js";
import { scenarios } from "./fixtures.js";
import type { ShadowOptions, ShadowView } from "./shadows.js";

const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim());
const host = `${platform()} ${release()} ${arch()}; ${cpus()[0]?.model}; ${cpus().length} CPUs; ${totalmem()} bytes RAM`;
const screenshots = fileURLToPath(new URL("../../../codex-work/screenshots/", import.meta.url));
const read = (page: Page) => page.evaluate(() => window.previewBenchmark.snapshot());
async function setup(page: Page, options: ShadowOptions) {
  await page.addInitScript(installPreviewProbe);
  await page.goto("/benchmarks/shadows.html");
  await page.waitForFunction(() => Boolean(window.createShadowStudy));
  return page.evaluate((options) => {
    window.previewBenchmark.phase("initialization");
    const start = performance.now();
    window.shadowStudy = window.createShadowStudy(options);
    return { setupCpuMs: performance.now() - start, coverage: window.shadowStudy.coverage };
  }, options);
}
async function render(page: Page, phase: string, view: ShadowView, angle = 0, force = false) {
  return page.evaluate(
    async ({ phase, view, angle, force }) => {
      window.previewBenchmark.phase(phase);
      return window.shadowStudy.render(view, angle, force);
    },
    { phase, view, angle, force },
  );
}
async function settle(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
  });
}
async function close(page: Page) {
  await page.evaluate(() => window.shadowStudy.destroy());
  await expect.poll(async () => (await read(page)).contexts[0].lost).toBe(true);
  for (const resource of Object.values((await read(page)).contexts[0].resources)) {
    expect(resource.live).toBe(0);
    expect(resource.created).toBe(resource.deleted + resource.reclaimed);
  }
}

for (const scenario of scenarios.filter((item) =>
  ["50-sparse", "50-full", "17x100-sparse", "256-full"].includes(item.id),
)) {
  for (const size of [0, 1024, 2048] as const) {
    test(`${scenario.id}-map${size}`, async ({ page, browser }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const initial = await setup(page, { scenario, size, dark: false });
      const first = await render(page, "first-map", "fit");
      expect(first.shadowDraws > 0).toBe(size > 0);
      const near = await render(page, "detail-change", "near");
      if (size && near.changed) expect(near.shadowDraws).toBeGreaterThan(0);
      const cached = [];
      for (let step = 0; step < 24; step++) {
        const result = await render(page, "cached-orbit", "near", (step * Math.PI) / 96);
        if (!result.changed) expect(result.shadowDraws).toBe(0);
        cached.push(result);
      }
      const refresh = await render(page, "forced-refresh", "near", (23 * Math.PI) / 96, true);
      expect(refresh.shadowDraws > 0).toBe(size > 0);
      const panned = await render(page, "offscreen-casters", "panned", 0, true);
      if (size && scenario.width === 256) expect(panned.offscreenCasters).toBeGreaterThan(0);
      // Images are manual artifacts; no screenshot expectation or timing threshold is used.
      if (info.repeatEachIndex === 0) {
        await mkdir(screenshots, { recursive: true });
        for (const dark of [false, true]) {
          await page.evaluate((dark) => window.shadowStudy.background(dark), dark);
          for (const view of ["fit", "near", "top", "oblique"] as const) {
            await render(page, "manual-capture", view);
            await page
              .locator("canvas")
              .screenshot({
                path: `${screenshots}issue-101-${info.project.name}-${scenario.id}-map${size}-${dark ? "dark" : "light"}-${view}.png`,
              });
          }
        }
      }
      await settle(page);
      const beforeIdle = (await read(page)).frames.length;
      await settle(page);
      expect((await read(page)).frames).toHaveLength(beforeIdle);
      const open = (await read(page)).contexts[0];
      expect(
        open.allocations.every(
          (allocation) => allocation.width <= 2048 && allocation.height <= 2048,
        ),
      ).toBe(true);
      await close(page);
      expect(errors).toEqual([]);
      const probe = await read(page);
      await writeFile(
        info.outputPath("shadows.json"),
        JSON.stringify(
          {
            protocol: "shadow-study-v1:1198x758:dpr1:24orbit:dev-scene",
            revision,
            dirty,
            repeat: info.repeatEachIndex,
            scenario: scenario.id,
            size,
            environment: {
              host,
              browser: browser.browserType().name(),
              version: browser.version(),
              renderer: open.renderer,
              timerSupported: open.timerSupported,
              device:
                process.env.PREVIEW_BENCHMARK_DEVICE ?? "Unspecified desktop; no physical phone",
              headless: info.project.use.headless ?? true,
            },
            initial,
            first,
            near,
            cached,
            refresh,
            panned,
            open,
            probe,
            checks: { idle: true, released: true, cache: true },
          },
          null,
          2,
        ) + "\n",
      );
    });
  }
}

test("releases a partially allocated shadow target after failure", async ({ page }) => {
  await setup(page, { scenario: scenarios[1], size: 2048, dark: false, failAllocation: true });
  await expect(render(page, "failed-map", "fit")).rejects.toThrow(
    "Injected shadow allocation failure",
  );
  await close(page);
  const context = (await read(page)).contexts[0];
  expect(context.allocations.some((item) => item.width === 2048)).toBe(true);
  expect(context.resources.Framebuffer.deleted).toBeGreaterThan(0);
});

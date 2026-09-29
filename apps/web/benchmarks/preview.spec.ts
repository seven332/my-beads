import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { cpus, platform, release, arch, totalmem } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parsePatternCsv } from "@my-beads/core";
import { fixture, scenarios } from "./fixtures.js";
import { installPreviewProbe } from "./probe.js";
import { summarize, type BenchmarkReport } from "./report.js";
import { openPreview, supportsWebGL } from "../e2e/preview-helpers.js";
import { openExport } from "../e2e/helpers.js";

const screenshotRoot = fileURLToPath(new URL("../../../codex-work/screenshots/", import.meta.url));
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim());
const host = `${platform()} ${release()} ${arch()}; ${cpus()[0]?.model}; ${cpus().length} CPUs; ${totalmem()} bytes RAM`;
export async function waitFrames(page: Page, count = 4) {
  await page.evaluate(async (count) => {
    for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame);
  }, count);
}
const read = (page: Page) => page.evaluate(() => window.previewBenchmark.snapshot());
const phase = (page: Page, name: string) =>
  page.evaluate((name) => window.previewBenchmark.phase(name), name);

for (const scenario of scenarios) {
  test(scenario.id, async ({ page, browser }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(installPreviewProbe);
    await page.goto("./");
    const csv = fixture(scenario);
    await page
      .getByLabel("Open CSV")
      .setInputFiles({ name: "Benchmark.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    // An unsupported renderer is a failed benchmark, not a fast zero-work sample.
    expect(await supportsWebGL(page), "This device cannot produce a WebGL baseline").toBe(true);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("my-beads.draft")))
      .not.toBeNull();
    const draft = await page.evaluate(() => localStorage.getItem("my-beads.draft"));
    const viewport = await page.getByLabel("Zoom level").textContent();
    const lifecycle: BenchmarkReport["lifecycle"] = [];

    for (let cycle = 0; cycle < 3; cycle++) {
      await phase(page, cycle === 0 ? "first-session-open" : `warm-open-${cycle}`);
      const dialog = await openPreview(page, true);
      await waitFrames(page);
      const initial = await read(page);
      expect(initial.contexts).toHaveLength(cycle + 1);
      expect(initial.openings).toHaveLength(cycle + 1);
      expect(initial.frames.some((frame) => frame.context === cycle + 1 && frame.draws > 0)).toBe(
        true,
      );
      if (cycle === 0) {
        await phase(page, "fitted");
        await dialog.getByRole("button", { name: "Reset view" }).click();
        await waitFrames(page);
        const screenshot = async (view: string) => {
          if (testInfo.repeatEachIndex !== 0 || !["50-sparse", "256-full"].includes(scenario.id))
            return;
          await mkdir(screenshotRoot, { recursive: true });
          await page.screenshot({
            path: `${screenshotRoot}issue-95-${testInfo.project.name}-${scenario.id}-${view}.png`,
          });
        };
        await screenshot("fitted");
        await phase(page, "close-up");
        for (let i = 0; i < 3; i++) {
          await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
          await waitFrames(page, 1);
        }
        await waitFrames(page);
        await screenshot("close");
        const box = (await dialog.locator("canvas").boundingBox())!;
        const start = { x: box.x + box.width * 0.45, y: box.y + box.height * 0.4 };
        for (const [name, button] of [
          ["orbit", "left"],
          ["pan", "right"],
        ] as const) {
          await phase(page, name);
          await page.mouse.move(start.x, start.y);
          await page.mouse.down({ button });
          for (let step = 1; step <= 24; step++) {
            await page.mouse.move(
              start.x + (box.width * 0.2 * step) / 24,
              start.y + (box.height * 0.1 * step) / 24,
            );
            await waitFrames(page, 1);
          }
          await page.mouse.up({ button });
          await waitFrames(page);
        }
        await phase(page, "zoom");
        for (let step = 0; step < 24; step++) {
          await page.mouse.wheel(0, step < 12 ? 10 : -10);
          await waitFrames(page, 2);
        }
        await waitFrames(page);
        const measured = await read(page);
        for (const name of ["fitted", "close-up", "orbit", "pan", "zoom"])
          expect(
            measured.frames.some((frame) => frame.phase === name && frame.draws > 0),
            `${name} rendered`,
          ).toBe(true);
      }
      await waitFrames(page, 8);
      await phase(page, "idle");
      const beforeIdle = (await read(page)).frames.reduce((sum, frame) => sum + frame.draws, 0);
      await waitFrames(page, 12);
      expect((await read(page)).frames.reduce((sum, frame) => sum + frame.draws, 0)).toBe(
        beforeIdle,
      );
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect
        .poll(async () => (await read(page)).contexts.every((context) => context.lost))
        .toBe(true);
      expect(
        (await read(page)).contexts.every((context) =>
          Object.values(context.resources).every((resource) => resource.live === 0),
        ),
      ).toBe(true);
      lifecycle.push({
        opened: initial.contexts[cycle],
        closed: (await read(page)).contexts[cycle],
      });
    }
    expect(await page.evaluate(() => localStorage.getItem("my-beads.draft"))).toBe(draft);
    expect(await page.getByLabel("Zoom level").textContent()).toBe(viewport);
    await openExport(page);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    const download = await downloading;
    expect(parsePatternCsv(await readFile((await download.path())!, "utf8"))).toEqual(
      parsePatternCsv(csv),
    );
    expect(errors).toEqual([]);

    const probe = await read(page);
    const report: BenchmarkReport = {
      schema: 1,
      protocol: "preview-v1:1440x1000:dpr1:3opens:24steps",
      scenario: scenario.id,
      repeat: testInfo.repeatEachIndex,
      revision,
      dirty,
      environment: {
        browser: browser.browserType().name(),
        browserVersion: browser.version(),
        host,
        deviceNote:
          process.env.PREVIEW_BENCHMARK_DEVICE ??
          "Unspecified desktop; physical phone not measured",
        headless: testInfo.project.use.headless ?? true,
        emulation: "none",
        viewport: page.viewportSize()!,
        ...(await page.evaluate(() => ({ dpr: devicePixelRatio, userAgent: navigator.userAgent }))),
        renderer: probe.contexts[0].renderer,
        framebuffer: probe.contexts[0].buffer,
        timerSupported: probe.contexts[0].timerSupported,
      },
      probe,
      lifecycle,
      summary: summarize(probe),
      checks: { idle: true, released: true, draft: true, csv: true },
    };
    const output = testInfo.outputPath("metrics.json");
    await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    await testInfo.attach("preview-metrics", { path: output, contentType: "application/json" });
  });
}

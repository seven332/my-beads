import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, arch, release, totalmem } from "node:os";
import { fileURLToPath } from "node:url";
import { fixture } from "./fixtures.js";
import { installPreviewProbe } from "./probe.js";
import { summarize } from "./report.js";
import { openPreview, supportsWebGL } from "../e2e/preview-helpers.js";

const screenshotRoot = fileURLToPath(new URL("../../../codex-work/screenshots/", import.meta.url));
const read = (page: Page) => page.evaluate(() => window.previewBenchmark.snapshot());
async function settle(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
  });
}
function motif() {
  return Array.from({ length: 22 }, (_, y) =>
    Array.from({ length: 22 }, (_, x) => {
      if (y >= 3 && y <= 11 && Math.abs(x - 10.5) <= Math.min(8.5, y + 0.5))
        return (y === 6 || y === 9) && (x === 6 || x === 7 || x === 13 || x === 14) ? "H2" : "F13";
      if (y >= 12 && y <= 19 && x >= 7 && x <= 14)
        return y === 14 && (x === 9 || x === 12) ? "H7" : "A1";
      return "";
    }).join(","),
  ).join("\n");
}
const cases = [
  { id: "motif", csv: motif },
  {
    id: "50-sparse",
    csv: () => fixture({ id: "50-sparse", width: 50, height: 50, fill: "sparse" }),
  },
  { id: "256-full", csv: () => fixture({ id: "256-full", width: 256, height: 256, fill: "full" }) },
  {
    id: "256-checker",
    csv: () =>
      Array.from({ length: 256 }, (_, y) =>
        Array.from({ length: 256 }, (_, x) => ((x + y) % 2 ? "" : "B15")).join(","),
      ).join("\n"),
  },
];

for (const scenario of cases)
  test(scenario.id, async ({ page, browser }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(installPreviewProbe);
    await page.goto("./");
    await page
      .getByLabel("Open CSV")
      .setInputFiles({
        name: "Fused.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(scenario.csv()),
      });
    expect(await supportsWebGL(page)).toBe(true);
    const draft = await page.evaluate(() => localStorage.getItem("my-beads.draft"));
    const dialog = await openPreview(page, true);
    await settle(page);
    const switches: { mode: string; cpuMs: number }[] = [];
    for (const mode of ["On board", "Fused", "On board", "Fused", "On board", "Fused"]) {
      await page.evaluate(
        (name) => window.previewBenchmark.phase(name),
        `${mode}-${switches.length}`,
      );
      const cpuMs = await dialog
        .getByRole("button", { name: mode, exact: true })
        .evaluate((button) => {
          const start = performance.now();
          (button as HTMLButtonElement).click();
          // Includes synchronous geometry/state/view work; excludes the scheduled GPU submission.
          return performance.now() - start;
        });
      switches.push({ mode, cpuMs });
      await settle(page);
      if (switches.length > 2) continue;
      await page.evaluate((name) => window.previewBenchmark.phase(name), `${mode}-orbit`);
      for (let step = 0; step < 12; step++) {
        await dialog.getByRole("button", { name: "Rotate left" }).click();
        await settle(page);
      }
      await page.evaluate((name) => window.previewBenchmark.phase(name), `${mode}-reset`);
      await dialog.getByRole("button", { name: "Reset view" }).click();
      await settle(page);
      if (scenario.id === "motif" && testInfo.repeatEachIndex === 0) {
        await page.evaluate(() => window.previewBenchmark.phase("screenshots"));
        await mkdir(screenshotRoot, { recursive: true });
        for (const mobile of [false, true]) {
          await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
          );
          for (const colorScheme of ["light", "dark"] as const) {
            await page.emulateMedia({ colorScheme });
            await settle(page);
            await page.screenshot({
              path: `${screenshotRoot}issue-109-${testInfo.project.name}-${mode === "Fused" ? "fused" : "board"}-${mobile ? "mobile" : "desktop"}-${colorScheme}.png`,
            });
          }
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.emulateMedia({ colorScheme: "light" });
        await settle(page);
        if (mode === "Fused") {
          const box = (await dialog.locator("canvas").boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.85, { steps: 8 });
          await page.mouse.up();
          await settle(page);
          await page.screenshot({
            path: `${screenshotRoot}issue-109-${testInfo.project.name}-fused-top.png`,
          });
        }
      }
    }
    const live = await read(page);
    const idle = live.frames.length;
    await settle(page);
    expect((await read(page)).frames).toHaveLength(idle);
    expect(live.contexts).toHaveLength(1);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await read(page)).contexts[0].lost).toBe(true);
    const probe = await read(page);
    expect(Object.values(probe.contexts[0].resources).every((r) => r.live === 0)).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem("my-beads.draft"))).toBe(draft);
    expect(errors).toEqual([]);
    const output = testInfo.outputPath("fused-metrics.json");
    await writeFile(
      output,
      JSON.stringify(
        {
          protocol: "fused-v1:1440x1000:dpr1:one-context:3-mode-pairs:12-orbit-buttons",
          scenario: scenario.id,
          repeat: testInfo.repeatEachIndex,
          revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
          dirty: Boolean(
            execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
          ),
          environment: {
            browser: browser.browserType().name(),
            version: browser.version(),
            host: `${platform()} ${release()} ${arch()}; ${cpus()[0]?.model}; ${cpus().length} CPUs; ${totalmem()} bytes RAM`,
            deviceNote:
              process.env.PREVIEW_BENCHMARK_DEVICE ?? "Desktop; physical phone not measured",
            viewport: { width: 1440, height: 1000 },
            dpr: 1,
            headless: testInfo.project.use.headless ?? true,
          },
          switches,
          probe,
          summary: summarize(probe),
          checks: { idle: true, released: true, draft: true },
        },
        null,
        2,
      ) + "\n",
    );
    await testInfo.attach("fused-metrics", { path: output, contentType: "application/json" });
  });

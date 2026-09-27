import { arch, platform, release } from "node:os";
import { parseArgs } from "node:util";
import { chromium, webkit } from "@playwright/test";
import playwright from "@playwright/test/package.json" with { type: "json" };

const { values } = parseArgs({
  options: {
    browser: { type: "string", default: "webkit" },
    headed: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.log("Usage: diagnose:pointer [--browser webkit|chromium] [--headed]");
  process.exit(0);
}
if (values.browser !== "webkit" && values.browser !== "chromium")
  throw new Error("--browser must be webkit or chromium");

const browserType = values.browser === "webkit" ? webkit : chromium;
const viewport = { width: 1440, height: 1000 };
// Keep raw values: headed macOS WebKit can introduce fractional CSS coordinates.
const coordinateTolerance = 1;
const browser = await browserType.launch({ headless: !values.headed });
const samples = [];
try {
  for (const deviceScaleFactor of [1, 2]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor });
    try {
      await page.setContent(
        '<canvas id="target" width="1440" height="1000" style="position:fixed;inset:0"></canvas>',
      );
      const metrics = await page.evaluate(() => ({
        screenX,
        screenY,
        outerWidth,
        outerHeight,
        innerWidth,
        innerHeight,
        devicePixelRatio,
        screenWidth: screen.width,
        screenHeight: screen.height,
      }));
      const captured = await page.evaluateHandle(() => {
        const events: {
          type: string;
          button: number;
          buttons: number;
          x: number;
          y: number;
          target: string | null;
          trusted: boolean;
        }[] = [];
        for (const type of [
          "pointerdown",
          "pointermove",
          "pointerup",
          "mousedown",
          "mousemove",
          "mouseup",
        ] as const)
          document.addEventListener(
            type,
            (event) =>
              events.push({
                type: event.type,
                button: event.button,
                buttons: event.buttons,
                x: event.clientX,
                y: event.clientY,
                target:
                  event.target instanceof Element ? event.target.id || event.target.tagName : null,
                trusted: event.isTrusted,
              }),
            true,
          );
        document.addEventListener("contextmenu", (event) => event.preventDefault());
        return events;
      });
      for (const [x, y] of [
        [600, 500],
        [100, 100],
        [1200, 800],
      ]) {
        for (const button of ["left", "middle", "right"] as const) {
          await page.mouse.move(x, y);
          await captured.evaluate((events) => events.splice(0));
          const hitTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, {
            x,
            y,
          });
          await page.mouse.down({ button });
          await page.mouse.move(x + 20, y + 10);
          await page.mouse.up({ button });
          const events = await captured.jsonValue();
          const mismatches: string[] = [];
          const buttonNumber = { left: 0, middle: 1, right: 2 }[button];
          const pressedButtons = { left: 1, middle: 4, right: 2 }[button];
          if (hitTarget !== "target") mismatches.push("Requested point misses the canvas");
          for (const family of ["pointer", "mouse"])
            for (const phase of ["down", "move", "up"]) {
              const type = family + phase;
              const matching = events.filter((event) => event.type === type);
              const expectedX = phase === "down" ? x : x + 20;
              const expectedY = phase === "down" ? y : y + 10;
              if (matching.length !== 1) mismatches.push(`${type}: expected one event`);
              for (const event of matching) {
                if (
                  Math.abs(event.x - expectedX) > coordinateTolerance ||
                  Math.abs(event.y - expectedY) > coordinateTolerance
                )
                  mismatches.push(`${type}: incorrect coordinates`);
                if (event.target !== "target") mismatches.push(`${type}: incorrect target`);
                if (!event.trusted) mismatches.push(`${type}: untrusted event`);
                if (event.buttons !== (phase === "up" ? 0 : pressedButtons))
                  mismatches.push(`${type}: incorrect pressed buttons`);
                // Mousemove.button differs between engines; buttons identifies the held key.
                if (phase !== "move" && event.button !== buttonNumber)
                  mismatches.push(`${type}: incorrect changed button`);
              }
            }
          samples.push({
            deviceScaleFactor,
            metrics,
            requested: { button, start: { x, y }, end: { x: x + 20, y: y + 10 } },
            hitTarget,
            events,
            mismatches,
          });
        }
      }
    } finally {
      await page.close();
    }
  }
  const failures = samples.filter((sample) => sample.mismatches.length > 0).length;
  console.log(
    JSON.stringify(
      {
        environment: {
          platform: platform(),
          release: release(),
          arch: arch(),
          node: process.version,
          playwright: playwright.version,
          browser: browserType.name(),
          browserVersion: browser.version(),
          headed: values.headed,
        },
        viewport,
        coordinateTolerance,
        failures,
        samples,
      },
      null,
      2,
    ),
  );
  if (failures) process.exitCode = 1;
} finally {
  await browser.close();
}

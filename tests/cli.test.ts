import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PNG } from "pngjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const runFile = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const sherma = join(root, "templates/hollow-knight/sherma-singing-50x50.csv");
let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "my-beads-test-")); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

function run(command: string, args: string[], cwd = root) {
  return runFile(process.execPath, [
    "--import", import.meta.resolve("tsx"), join(root, "apps/cli/src", command + ".ts"), ...args,
  ], { cwd });
}

describe("CLI compatibility", () => {
  it.each([1, 20])("renders every Sherma pixel and alpha at %ix scale", async (scale) => {
    const output = join(directory, "pixel.png");
    const result = await run("generate-pixel-art", [sherma, "--output", output, "--scale", String(scale)]);
    expect(result.stdout).toContain("1270 beads");
    const png = PNG.sync.read(await readFile(output));
    expect([png.width, png.height]).toEqual([50 * scale, 50 * scale]);
    // The committed fixture uses six-digit hex and TRANSPARENT. This oracle does not use core parsing/rendering.
    const rows = (await readFile(sherma, "utf8")).trim().split(/\r?\n/).map((line) => line.split(","));
    const expected = Buffer.alloc(png.width * png.height * 4);
    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        const hex = rows[Math.floor(y / scale)][Math.floor(x / scale)];
        if (hex === "TRANSPARENT") continue;
        const offset = (y * png.width + x) * 4;
        expected[offset] = Number.parseInt(hex.slice(1, 3), 16);
        expected[offset + 1] = Number.parseInt(hex.slice(3, 5), 16);
        expected[offset + 2] = Number.parseInt(hex.slice(5, 7), 16);
        expected[offset + 3] = 255;
      }
    }
    expect(png.data.equals(expected)).toBe(true);
  });

  it("generates an English chart with escaped title, cell labels and separate legend lines", async () => {
    const output = join(directory, "chart.svg");
    await run("generate-chart", [sherma, "--output", output, "--title", 'Sherma & <friends>']);
    const svg = await readFile(output, "utf8");
    expect(svg).toContain("Sherma &amp; &lt;friends&gt;");
    expect(svg).toContain("50 × 50 grid · 9 colors · 1270 beads");
    expect(svg).toContain(">MARD 221</text>");
    expect(svg).toContain('stroke-dasharray="6 6"');
    expect(svg).toMatch(/>#000000<\/text>\s*<text[^>]+>524 beads<\/text>/);
    expect((svg.match(/dominant-baseline="central"[^>]+>H7<\/text>/g) ?? []).length).toBe(524);
  });

  it("renders chart PNGs with the platform font adapter", async () => {
    const output = join(directory, "chart.png");
    await run("generate-chart", [sherma, "--output", output]);
    const png = PNG.sync.read(await readFile(output));
    expect(png.width).toBe(2400);
    expect(png.height).toBeGreaterThan(2000);
    expect([...png.data.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    expect(png.data.some((channel, i) => i % 4 !== 3 && channel < 100)).toBe(true);
  });

  it("resolves custom palettes, input and default output paths from the caller's directory", async () => {
    await writeFile(join(directory, "custom.json"), JSON.stringify({ colors: { X1: "#123456" } }));
    await writeFile(join(directory, "custom.csv"), "X1,TRANSPARENT");
    await run("generate-pixel-art", ["custom.csv", "--palette", "custom.json", "--scale", "1"], directory);
    const png = PNG.sync.read(await readFile(join(directory, "custom-pixel-art.png")));
    expect([...png.data]).toEqual([18, 52, 86, 255, 0, 0, 0, 0]);
    await run("generate-chart", ["custom.csv", "--palette", "custom.json"], directory);
    expect(PNG.sync.read(await readFile(join(directory, "custom-chart.png"))).width).toBe(2400);
    const match = await run("find-closest-color", ["123456", "--palette", "custom.json"], directory);
    expect(match.stdout).toContain("Closest: X1 (#123456)");
    expect(match.stdout).toContain("Delta E: 0.00");
  });

  it("retains color matcher CLI modes", async () => {
    const match = await run("find-closest-color", ["4D4D3D", "35352A", "--unique", "--series", "B"]);
    expect(match.stdout).toContain("Closest: B15 (#2E5132)");
    expect(match.stdout).toContain("Closest: B23 (#303921)");
    expect(match.stdout).toContain("Mode: preserve chroma, unique colors, series B");
  });

  it.each([
    ["generate-chart", ["--width", "799"], "--width must be"],
    ["generate-chart", ["--output"], "--output requires"],
    ["generate-chart", ["--title"], "--title requires"],
    ["generate-chart", ["--palette"], "--palette requires"],
    ["generate-pixel-art", ["--scale", "1.5"], "--scale must be"],
    ["generate-pixel-art", ["--output", "test.svg"], "Output must use"],
    ["generate-pixel-art", ["--palette"], "--palette requires"],
    ["generate-pixel-art", ["--unknown"], "Unknown option"],
  ] as const)("rejects invalid %s options %j", async (command, args, message) => {
    await expect(run(command, [sherma, ...args])).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining(message) });
  });

  it("keeps beadless input rejection at the CLI boundary", async () => {
    await writeFile(join(directory, "blank.csv"), '"",ERASE');
    await expect(run("generate-pixel-art", ["blank.csv"], directory))
      .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("does not contain any beads") });
  });
});

import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { Resvg } from "@resvg/resvg-js";

import { renderChart } from "@my-beads/core";
import { defaultPalettePath, loadPattern } from "./pattern.js";

type Options = { input: string; output: string; palette: string; title: string; width: number };

const runFile = promisify(execFile);

function localFont(): { family: string; path: string } | undefined {
  const candidates: Array<{ family: string; path: string }> = [
    { family: "Arial", path: "/System/Library/Fonts/Supplemental/Arial.ttf" },
    { family: "DejaVu Sans", path: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf" },
    { family: "Arial", path: "C:\\Windows\\Fonts\\arial.ttf" },
  ];
  return candidates.find((candidate) => existsSync(candidate.path));
}

function usage(): string {
  return [
    "Generate a printable bead-pattern chart from a CSV or TSV file.",
    "",
    "Usage:",
    "  pnpm generate <input.csv> [options]",
    "",
    "Options:",
    "  --output <path>   Output .png or .svg path",
    "  --title <text>    Chart title",
    "  --palette <path>  Palette JSON path",
    "  --width <pixels>  Output width (default: 2400)",
    "  --help            Show this help",
  ].join("\n");
}

function defaultTitle(input: string): string {
  const stem = basename(input, extname(input)).replace(/-\d+x\d+$/i, "");
  const words = stem
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.join(" ");
}

function parseArguments(argv: string[]): Options {
  let input = "";
  let output = "";
  let palette = defaultPalettePath;
  let title = "";
  let width = 2400;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (argument === "--output" || argument === "-o") {
      output = argv[++index] ?? "";
      if (!output) throw new Error("--output requires a path");
      continue;
    }
    if (argument === "--title") {
      title = argv[++index] ?? "";
      if (!title) throw new Error("--title requires text");
      continue;
    }
    if (argument === "--palette") {
      palette = argv[++index] ?? "";
      if (!palette) throw new Error("--palette requires a path");
      continue;
    }
    if (argument === "--width") {
      width = Number(argv[++index]);
      continue;
    }
    if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    }
    if (input) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    input = argument;
  }

  if (!input) {
    throw new Error(`Missing input CSV.\n\n${usage()}`);
  }
  if (!Number.isInteger(width) || width < 800 || width > 10_000) {
    throw new Error("--width must be an integer between 800 and 10000");
  }

  input = resolve(input);
  output = resolve(output || input.replace(/\.(csv|tsv)$/i, "-chart.png"));
  palette = resolve(palette);
  title ||= defaultTitle(input);

  const outputExtension = extname(output).toLowerCase();
  if (outputExtension !== ".png" && outputExtension !== ".svg") {
    throw new Error("Output must use the .png or .svg extension");
  }

  return { input, output, palette, title, width };
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const { pattern, counts } = await loadPattern(options.input, options.palette);
  const svg = renderChart(pattern, counts, options.title, options.width);

  await mkdir(dirname(options.output), { recursive: true });
  if (extname(options.output).toLowerCase() === ".svg") {
    await writeFile(options.output, svg, "utf8");
  } else if (process.platform === "darwin" && existsSync("/usr/bin/sips")) {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "my-beads-"));
    const temporarySvg = join(temporaryDirectory, "chart.svg");
    try {
      await writeFile(temporarySvg, svg, "utf8");
      await runFile("/usr/bin/sips", [
        "-s",
        "format",
        "png",
        temporarySvg,
        "--out",
        options.output,
      ]);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  } else {
    const font = localFont();
    const renderer = new Resvg(svg, {
      background: "#FFFFFF",
      fitTo: { mode: "width", value: options.width },
      font: {
        loadSystemFonts: !font,
        fontFiles: font ? [font.path] : undefined,
        defaultFontFamily: font?.family,
        sansSerifFamily: font?.family,
      },
      shapeRendering: 2,
      textRendering: 1,
    });
    await writeFile(options.output, renderer.render().asPng());
  }

  const beadCount = [...counts.values()].reduce((total, count) => total + count, 0);
  console.log(`Generated ${options.output}`);
  console.log(
    `${pattern[0].length} × ${pattern.length} grid · ${counts.size} colors · ${beadCount} beads`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

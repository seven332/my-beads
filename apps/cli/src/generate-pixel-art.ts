import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

import { Resvg } from "@resvg/resvg-js";

import { renderPixelArtSvg } from "@my-beads/core";
import { defaultPalettePath, loadPattern } from "./pattern.js";

type Options = {
  input: string;
  output: string;
  palette: string;
  scale: number;
};

function usage(): string {
  return [
    "Generate scaled pixel art directly from a bead-pattern CSV file.",
    "",
    "Usage:",
    "  pnpm generate:pixel <input.csv> [options]",
    "",
    "Options:",
    "  --output <path>   Output .png path",
    "  --scale <number>  Integer scale factor (default: 16)",
    "  --palette <path>  Palette JSON path",
    "  --help            Show this help",
  ].join("\n");
}

function defaultOutputPath(input: string): string {
  const extension = extname(input);
  const stem = extension.toLowerCase() === ".csv" ? input.slice(0, -extension.length) : input;
  return `${stem}-pixel-art.png`;
}

function parseArguments(argv: string[]): Options {
  let input = "";
  let output = "";
  let palette = defaultPalettePath;
  let scale = 16;

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
    if (argument === "--scale" || argument === "-s") {
      scale = Number(argv[++index]);
      continue;
    }
    if (argument === "--palette") {
      palette = argv[++index] ?? "";
      if (!palette) throw new Error("--palette requires a path");
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
  if (!Number.isInteger(scale) || scale < 1 || scale > 512) {
    throw new Error("--scale must be an integer between 1 and 512");
  }

  input = resolve(input);
  output = resolve(output || defaultOutputPath(input));
  palette = resolve(palette);
  if (extname(output).toLowerCase() !== ".png") {
    throw new Error("Output must use the .png extension");
  }

  return { input, output, palette, scale };
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const { pattern, counts } = await loadPattern(options.input, options.palette);
  const width = pattern[0].length * options.scale;
  const height = pattern.length * options.scale;

  const renderer = new Resvg(renderPixelArtSvg(pattern, options.scale), {
    fitTo: { mode: "original" },
    font: { loadSystemFonts: false },
    shapeRendering: 1,
    imageRendering: 1,
  });
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, renderer.render().asPng());

  const beadCount = [...counts.values()].reduce((total, count) => total + count, 0);
  console.log(`Generated ${options.output}`);
  console.log(
    `${pattern[0].length} × ${pattern.length} pixels · ${options.scale}× scale · ${width} × ${height} output · ${beadCount} beads`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

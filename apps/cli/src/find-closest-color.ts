import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { matchColors, normalizeHex } from "@my-beads/core";
import { defaultPalettePath } from "./pattern.js";

type Options = {
  includeNeutral: boolean;
  inputs: string[];
  palette: string;
  series: string[];
  unique: boolean;
};

function usage(): string {
  return [
    "Find the closest MARD 221 colors to one or more hex colors.",
    "",
    "Usage:",
    "  pnpm match:color <hex> [hex...] [options]",
    "",
    "Options:",
    "  --palette <path>   Palette JSON path",
    "  --series <list>    Limit matches to MARD series, e.g. B or B,M",
    "  --include-neutral  Include neutral colors for tinted inputs",
    "  --unique           Assign a different palette color to each input",
    "  --help             Show this help",
  ].join("\n");
}

function parseArguments(argv: string[]): Options {
  let includeNeutral = false;
  const inputs: string[] = [];
  let palette = defaultPalettePath;
  let series: string[] = [];
  let unique = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (argument === "--palette") {
      palette = argv[++index] ?? "";
      if (!palette) throw new Error("--palette requires a path");
      continue;
    }
    if (argument === "--include-neutral") {
      includeNeutral = true;
      continue;
    }
    if (argument === "--series") {
      const value = argv[++index] ?? "";
      series = value
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);
      if (!series.length || series.some((item) => !/^[A-Z]+$/.test(item))) {
        throw new Error("--series requires a comma-separated list of letter prefixes");
      }
      continue;
    }
    if (argument === "--unique") {
      unique = true;
      continue;
    }
    if (argument.startsWith("-") && argument !== "-") {
      throw new Error(`Unknown option: ${argument}`);
    }
    inputs.push(normalizeHex(argument));
  }

  if (!inputs.length) {
    throw new Error(`Missing hex color.\n\n${usage()}`);
  }

  return { includeNeutral, inputs, palette: resolve(palette), series, unique };
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const palette: unknown = JSON.parse(await readFile(options.palette, "utf8"));
  const matches = matchColors(options.inputs, palette, options);
  for (const [index, match] of matches.entries()) {
    if (index > 0) console.log("");
    console.log(`Input: ${match.input}`);
    console.log(`Closest: ${match.code} (${match.hex})`);
    console.log(`Delta E: ${match.deltaE.toFixed(2)} (CIEDE2000)`);
    const modes = [match.preserveChroma ? "preserve chroma" : "all colors"];
    if (match.neutralFallback) modes.push("neutral fallback");
    if (options.unique) modes.push("unique colors");
    if (options.series.length) modes.push(`series ${options.series.join(",")}`);
    console.log(`Mode: ${modes.join(", ")}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

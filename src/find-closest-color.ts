import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { defaultPalettePath, type PaletteDocument } from "./pattern.js";

type Lab = [lightness: number, a: number, b: number];

type Options = {
  includeNeutral: boolean;
  inputs: string[];
  palette: string;
  series: string[];
  unique: boolean;
};

type PaletteColor = {
  code: string;
  hex: string;
  lab: Lab;
  chroma: number;
};

const chromaticThreshold = 5;

function usage(): string {
  return [
    "Find the closest MARD 221 colors to one or more hex colors.",
    "",
    "Usage:",
    "  npm run match:color -- <hex> [hex...] [options]",
    "",
    "Options:",
    "  --palette <path>   Palette JSON path",
    "  --series <list>    Limit matches to MARD series, e.g. B or B,M",
    "  --include-neutral  Include neutral colors for tinted inputs",
    "  --unique           Assign a different palette color to each input",
    "  --help             Show this help",
  ].join("\n");
}

function normalizeHex(value: string): string {
  let hex = value.trim().replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{3}$/.test(hex)) {
    hex = [...hex].map((character) => character.repeat(2)).join("");
  }
  if (!/^[0-9A-F]{6}$/.test(hex)) {
    throw new Error(`Invalid hex color: ${value}`);
  }
  return `#${hex}`;
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

function hexToLab(hex: string): Lab {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const [red, green, blue] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  const x = (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047;
  const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175;
  const z = (red * 0.0193339 + green * 0.119192 + blue * 0.9503041) / 1.08883;
  const transform = (value: number): number =>
    value > 216 / 24_389 ? Math.cbrt(value) : ((24_389 / 27) * value + 16) / 116;
  const transformedX = transform(x);
  const transformedY = transform(y);
  const transformedZ = transform(z);

  return [
    116 * transformedY - 16,
    500 * (transformedX - transformedY),
    200 * (transformedY - transformedZ),
  ];
}

function deltaE2000(first: Lab, second: Lab): number {
  const [lightness1, a1, b1] = first;
  const [lightness2, a2, b2] = second;
  const radians = Math.PI / 180;
  const degrees = 180 / Math.PI;
  const chroma1 = Math.hypot(a1, b1);
  const chroma2 = Math.hypot(a2, b2);
  const meanChroma = (chroma1 + chroma2) / 2;
  const compensation =
    0.5 * (1 - Math.sqrt(meanChroma ** 7 / (meanChroma ** 7 + 25 ** 7)));
  const adjustedA1 = (1 + compensation) * a1;
  const adjustedA2 = (1 + compensation) * a2;
  const adjustedChroma1 = Math.hypot(adjustedA1, b1);
  const adjustedChroma2 = Math.hypot(adjustedA2, b2);

  const hue = (a: number, b: number): number => {
    const angle = Math.atan2(b, a) * degrees;
    return angle < 0 ? angle + 360 : angle;
  };
  const hue1 = hue(adjustedA1, b1);
  const hue2 = hue(adjustedA2, b2);
  const deltaLightness = lightness2 - lightness1;
  const deltaChroma = adjustedChroma2 - adjustedChroma1;

  let deltaHueAngle: number;
  if (adjustedChroma1 * adjustedChroma2 === 0) {
    deltaHueAngle = 0;
  } else if (Math.abs(hue2 - hue1) <= 180) {
    deltaHueAngle = hue2 - hue1;
  } else if (hue2 <= hue1) {
    deltaHueAngle = hue2 - hue1 + 360;
  } else {
    deltaHueAngle = hue2 - hue1 - 360;
  }

  const deltaHue =
    2 * Math.sqrt(adjustedChroma1 * adjustedChroma2) * Math.sin((deltaHueAngle * radians) / 2);
  const meanLightness = (lightness1 + lightness2) / 2;
  const meanAdjustedChroma = (adjustedChroma1 + adjustedChroma2) / 2;

  let meanHue: number;
  if (adjustedChroma1 * adjustedChroma2 === 0) {
    meanHue = hue1 + hue2;
  } else if (Math.abs(hue1 - hue2) <= 180) {
    meanHue = (hue1 + hue2) / 2;
  } else if (hue1 + hue2 < 360) {
    meanHue = (hue1 + hue2 + 360) / 2;
  } else {
    meanHue = (hue1 + hue2 - 360) / 2;
  }

  const hueWeight =
    1 -
    0.17 * Math.cos((meanHue - 30) * radians) +
    0.24 * Math.cos(2 * meanHue * radians) +
    0.32 * Math.cos((3 * meanHue + 6) * radians) -
    0.2 * Math.cos((4 * meanHue - 63) * radians);
  const lightnessWeight =
    1 +
    (0.015 * (meanLightness - 50) ** 2) /
      Math.sqrt(20 + (meanLightness - 50) ** 2);
  const chromaWeight = 1 + 0.045 * meanAdjustedChroma;
  const hueDifferenceWeight = 1 + 0.015 * meanAdjustedChroma * hueWeight;
  const rotation =
    -2 *
    Math.sqrt(meanAdjustedChroma ** 7 / (meanAdjustedChroma ** 7 + 25 ** 7)) *
    Math.sin(
      60 * Math.exp(-(((meanHue - 275) / 25) ** 2)) * radians,
    );
  const normalizedLightness = deltaLightness / lightnessWeight;
  const normalizedChroma = deltaChroma / chromaWeight;
  const normalizedHue = deltaHue / hueDifferenceWeight;

  return Math.sqrt(
    normalizedLightness ** 2 +
      normalizedChroma ** 2 +
      normalizedHue ** 2 +
      rotation * normalizedChroma * normalizedHue,
  );
}

function assignUniqueColors(costs: number[][]): number[] {
  const rowCount = costs.length;
  const columnCount = costs[0].length;
  if (rowCount > columnCount) {
    throw new Error("Unique matching requires at least one palette color per input");
  }

  const rowPotentials = Array<number>(rowCount + 1).fill(0);
  const columnPotentials = Array<number>(columnCount + 1).fill(0);
  const matchedRows = Array<number>(columnCount + 1).fill(0);
  const previousColumns = Array<number>(columnCount + 1).fill(0);

  for (let row = 1; row <= rowCount; row += 1) {
    matchedRows[0] = row;
    const minimumCosts = Array<number>(columnCount + 1).fill(Number.POSITIVE_INFINITY);
    const usedColumns = Array<boolean>(columnCount + 1).fill(false);
    let currentColumn = 0;

    do {
      usedColumns[currentColumn] = true;
      const currentRow = matchedRows[currentColumn];
      let nextColumn = 0;
      let delta = Number.POSITIVE_INFINITY;

      for (let column = 1; column <= columnCount; column += 1) {
        if (usedColumns[column]) continue;
        const cost =
          costs[currentRow - 1][column - 1] -
          rowPotentials[currentRow] -
          columnPotentials[column];
        if (cost < minimumCosts[column]) {
          minimumCosts[column] = cost;
          previousColumns[column] = currentColumn;
        }
        if (minimumCosts[column] < delta) {
          delta = minimumCosts[column];
          nextColumn = column;
        }
      }

      for (let column = 0; column <= columnCount; column += 1) {
        if (usedColumns[column]) {
          rowPotentials[matchedRows[column]] += delta;
          columnPotentials[column] -= delta;
        } else if (column > 0) {
          minimumCosts[column] -= delta;
        }
      }
      currentColumn = nextColumn;
    } while (matchedRows[currentColumn] !== 0);

    do {
      const previousColumn = previousColumns[currentColumn];
      matchedRows[currentColumn] = matchedRows[previousColumn];
      currentColumn = previousColumn;
    } while (currentColumn !== 0);
  }

  const assignments = Array<number>(rowCount).fill(-1);
  for (let column = 1; column <= columnCount; column += 1) {
    if (matchedRows[column] > 0) {
      assignments[matchedRows[column] - 1] = column - 1;
    }
  }
  return assignments;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const palette = JSON.parse(await readFile(options.palette, "utf8")) as PaletteDocument;
  if (!palette.colors || typeof palette.colors !== "object" || Array.isArray(palette.colors)) {
    throw new Error("Palette JSON must contain a 'colors' object");
  }

  const paletteColors: PaletteColor[] = Object.entries(palette.colors)
    .filter(
      ([code]) =>
        !options.series.length ||
        options.series.some((prefix) => code.toUpperCase().startsWith(prefix)),
    )
    .map(([code, rawHex]) => {
      const hex = normalizeHex(rawHex);
      const lab = hexToLab(hex);
      return { code, hex, lab, chroma: Math.hypot(lab[1], lab[2]) };
    });
  if (!paletteColors.length) {
    throw new Error("No palette colors match the selected series");
  }

  const chromaticColors = paletteColors.filter((color) => color.chroma >= chromaticThreshold);
  const inputs = options.inputs.map((hex) => {
    const lab = hexToLab(hex);
    const preserveChroma =
      !options.includeNeutral &&
      Math.hypot(lab[1], lab[2]) >= chromaticThreshold &&
      chromaticColors.length > 0;
    return { hex, lab, preserveChroma };
  });
  const differences = inputs.map((input) =>
    paletteColors.map((color) => deltaE2000(input.lab, color.lab)),
  );
  const excludedColorPenalty = 1_000_000;
  const costs = differences.map((row, inputIndex) =>
    row.map((difference, colorIndex) =>
      inputs[inputIndex].preserveChroma &&
      paletteColors[colorIndex].chroma < chromaticThreshold
        ? difference + excludedColorPenalty
        : difference,
    ),
  );
  const assignments = options.unique
    ? assignUniqueColors(costs)
    : costs.map((row) => row.indexOf(Math.min(...row)));

  for (let index = 0; index < inputs.length; index += 1) {
    const colorIndex = assignments[index];
    const input = inputs[index];
    const closest = paletteColors[colorIndex];
    if (index > 0) console.log("");
    console.log(`Input: ${input.hex}`);
    console.log(`Closest: ${closest.code} (${closest.hex})`);
    console.log(`Delta E: ${differences[index][colorIndex].toFixed(2)} (CIEDE2000)`);
    const modes = [input.preserveChroma ? "preserve chroma" : "all colors"];
    if (options.unique) modes.push("unique colors");
    if (options.series.length) modes.push(`series ${options.series.join(",")}`);
    console.log(`Mode: ${modes.join(", ")}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

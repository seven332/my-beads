import { defaultPalette, normalizeHex, validatePalette } from "./palette.js";

export type Lab = readonly [lightness: number, a: number, b: number];
export type MatchOptions = {
  readonly includeNeutral?: boolean;
  readonly series?: readonly string[];
  readonly unique?: boolean;
};
export type ColorMatch = {
  readonly input: string;
  readonly code: string;
  readonly hex: string;
  readonly deltaE: number;
  readonly preserveChroma: boolean;
  readonly neutralFallback: boolean;
};
type PaletteColor = { code: string; hex: string; lab: Lab; chroma: number };
const chromaticThreshold = 5;

export function hexToLab(hex: string): Lab {
  hex = normalizeHex(hex);
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

export function deltaE2000(first: Lab, second: Lab): number {
  const [lightness1, a1, b1] = first;
  const [lightness2, a2, b2] = second;
  const radians = Math.PI / 180;
  const degrees = 180 / Math.PI;
  const chroma1 = Math.hypot(a1, b1);
  const chroma2 = Math.hypot(a2, b2);
  const meanChroma = (chroma1 + chroma2) / 2;
  const compensation = 0.5 * (1 - Math.sqrt(meanChroma ** 7 / (meanChroma ** 7 + 25 ** 7)));
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
    1 + (0.015 * (meanLightness - 50) ** 2) / Math.sqrt(20 + (meanLightness - 50) ** 2);
  const chromaWeight = 1 + 0.045 * meanAdjustedChroma;
  const hueDifferenceWeight = 1 + 0.015 * meanAdjustedChroma * hueWeight;
  const rotation =
    -2 *
    Math.sqrt(meanAdjustedChroma ** 7 / (meanAdjustedChroma ** 7 + 25 ** 7)) *
    Math.sin(60 * Math.exp(-(((meanHue - 275) / 25) ** 2)) * radians);
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
          costs[currentRow - 1][column - 1] - rowPotentials[currentRow] - columnPotentials[column];
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

export function matchColors(
  inputHexes: readonly string[],
  palette: unknown = defaultPalette,
  options: MatchOptions = {},
): ColorMatch[] {
  const validated = validatePalette(palette);
  const series = (options.series ?? []).map((prefix) => prefix.trim().toUpperCase());
  if (series.some((prefix) => !/^[A-Z]+$/.test(prefix))) {
    throw new Error("Series must contain letter prefixes");
  }
  if (!inputHexes.length) return [];
  const paletteColors: PaletteColor[] = Object.entries(validated.colors)
    .filter(
      ([code]) => !series.length || series.some((prefix) => code.toUpperCase().startsWith(prefix)),
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
  const inputs = inputHexes.map((rawHex) => {
    const hex = normalizeHex(rawHex);
    const lab = hexToLab(hex);
    const preserveChroma =
      !options.includeNeutral &&
      Math.hypot(lab[1], lab[2]) >= chromaticThreshold &&
      chromaticColors.length > 0;
    return { hex, lab, preserveChroma };
  });
  // Shared assignments need only one row at a time, even for color-rich images.
  if (!options.unique) {
    return inputs.map((input) => {
      let closest = paletteColors[0];
      let best = Infinity;
      let difference = Infinity;
      for (const color of paletteColors) {
        const delta = input.hex === color.hex ? 0 : deltaE2000(input.lab, color.lab);
        const cost =
          delta + (input.preserveChroma && color.chroma < chromaticThreshold ? 1_000_000 : 0);
        if (cost < best) {
          closest = color;
          best = cost;
          difference = delta;
        }
      }
      return {
        input: input.hex,
        code: closest.code,
        hex: closest.hex,
        deltaE: difference,
        preserveChroma: input.preserveChroma,
        neutralFallback: input.preserveChroma && closest.chroma < chromaticThreshold,
      };
    });
  }
  const differences = inputs.map((input) =>
    paletteColors.map((color) => deltaE2000(input.lab, color.lab)),
  );
  const excludedColorPenalty = 1_000_000;
  const costs = differences.map((row, inputIndex) =>
    row.map((difference, colorIndex) =>
      inputs[inputIndex].preserveChroma && paletteColors[colorIndex].chroma < chromaticThreshold
        ? difference + excludedColorPenalty
        : difference,
    ),
  );
  const assignments = assignUniqueColors(costs);

  return inputs.map((input, index) => {
    const colorIndex = assignments[index];
    const closest = paletteColors[colorIndex];
    return {
      input: input.hex,
      code: closest.code,
      hex: closest.hex,
      deltaE: differences[index][colorIndex],
      preserveChroma: input.preserveChroma,
      neutralFallback: input.preserveChroma && closest.chroma < chromaticThreshold,
    };
  });
}

import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { Resvg } from "@resvg/resvg-js";

import { defaultPalettePath, loadPattern, type PatternCell } from "./pattern.js";

type Options = {
  input: string;
  output: string;
  palette: string;
  title: string;
  width: number;
};

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
    "Generate a printable bead-pattern chart from a CSV file.",
    "",
    "Usage:",
    "  npm run generate -- <input.csv> [options]",
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
      continue;
    }
    if (argument === "--title") {
      title = argv[++index] ?? "";
      continue;
    }
    if (argument === "--palette") {
      palette = argv[++index] ?? "";
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
  output = resolve(output || input.replace(/\.csv$/i, "-chart.png"));
  palette = resolve(palette);
  title ||= defaultTitle(input);

  const outputExtension = extname(output).toLowerCase();
  if (outputExtension !== ".png" && outputExtension !== ".svg") {
    throw new Error("Output must use the .png or .svg extension");
  }

  return { input, output, palette, title, width };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function textColor(hex: string): string {
  return relativeLuminance(hex) > 0.42 ? "#242229" : "#FFFFFF";
}

function renderChart(
  pattern: PatternCell[][],
  counts: Map<string, number>,
  title: string,
  pageWidth: number,
): string {
  const rows = pattern.length;
  const columns = pattern[0].length;
  const colors = [...counts.entries()]
    .map(([code, count]) => ({ code, count, hex: pattern.flat().find((cell) => cell.code === code)!.hex }))
    .sort((left, right) => relativeLuminance(left.hex) - relativeLuminance(right.hex));
  const beadCount = colors.reduce((total, color) => total + color.count, 0);

  const cellSize = Math.max(12, Math.floor(Math.min(48, (pageWidth - 250) / columns)));
  const gridWidth = columns * cellSize;
  const gridHeight = rows * cellSize;
  const gridX = Math.round((pageWidth - gridWidth) / 2);
  const gridY = Math.max(190, Math.round(pageWidth * 0.08));
  const axisOffset = Math.max(24, Math.round(cellSize * 0.7));
  const legendTop = gridY + gridHeight + axisOffset + 46;
  const legendGap = Math.max(12, Math.round(pageWidth * 0.006));
  const legendMargin = Math.max(80, Math.round(pageWidth * 0.045));
  const maxLegendColumns = 9;
  const legendColumns = Math.max(1, Math.min(maxLegendColumns, colors.length));
  const legendCardWidth =
    (pageWidth - legendMargin * 2 - legendGap * (legendColumns - 1)) / legendColumns;
  const legendCardHeight = Math.max(104, Math.round(pageWidth * 0.046));
  const legendRows = Math.ceil(colors.length / legendColumns);
  const legendHeight = legendRows * legendCardHeight + (legendRows - 1) * legendGap;
  const footerY = legendTop + legendHeight + 50;
  const pageHeight = Math.ceil(footerY + 45);
  const cellFontSize = Math.max(8, Math.min(17, cellSize * 0.36));
  const axisFontSize = Math.max(12, Math.min(19, cellSize * 0.42));
  const svg: string[] = [];

  svg.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}">`,
    `<rect width="${pageWidth}" height="${pageHeight}" fill="#FFFFFF"/>`,
    `<g font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', '.SF NS', 'Segoe UI', Arial, 'DejaVu Sans', sans-serif">`,
    `<text x="${pageWidth / 2}" y="62" text-anchor="middle" font-size="52" font-weight="700" fill="#242229">${escapeXml(title)}</text>`,
    `<text x="${pageWidth / 2}" y="112" text-anchor="middle" font-size="26" fill="#77737D">${columns} × ${rows} grid · ${colors.length} colors · ${beadCount} beads</text>`,
    `<rect x="${gridX}" y="${gridY}" width="${gridWidth}" height="${gridHeight}" fill="#F7F8F8"/>`,
  );

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = pattern[row][column];
      if (cell.transparent) continue;
      const x = gridX + column * cellSize;
      const y = gridY + row * cellSize;
      svg.push(
        `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${cell.hex}"/>`,
        `<text x="${x + cellSize / 2}" y="${y + cellSize / 2}" text-anchor="middle" dominant-baseline="central" font-size="${cellFontSize}" font-weight="600" fill="${textColor(cell.hex)}">${escapeXml(cell.code)}</text>`,
      );
    }
  }

  for (let column = 0; column <= columns; column += 1) {
    const x = gridX + column * cellSize;
    const edge = column === 0 || column === columns;
    const ten = column > 0 && column % 10 === 0;
    const five = column > 0 && column % 5 === 0;
    const stroke = edge ? "#A5A3A8" : ten ? "#A98A61" : five ? "#CBB99D" : "#D9DCDF";
    const width = edge ? 2.2 : ten ? 2.2 : five ? 1.5 : 1;
    const dash = five && !ten ? ' stroke-dasharray="6 6"' : "";
    svg.push(
      `<line x1="${x}" y1="${gridY}" x2="${x}" y2="${gridY + gridHeight}" stroke="${stroke}" stroke-width="${width}"${dash}/>`
    );
  }
  for (let row = 0; row <= rows; row += 1) {
    const y = gridY + row * cellSize;
    const edge = row === 0 || row === rows;
    const ten = row > 0 && row % 10 === 0;
    const five = row > 0 && row % 5 === 0;
    const stroke = edge ? "#A5A3A8" : ten ? "#A98A61" : five ? "#CBB99D" : "#D9DCDF";
    const width = edge ? 2.2 : ten ? 2.2 : five ? 1.5 : 1;
    const dash = five && !ten ? ' stroke-dasharray="6 6"' : "";
    svg.push(
      `<line x1="${gridX}" y1="${y}" x2="${gridX + gridWidth}" y2="${y}" stroke="${stroke}" stroke-width="${width}"${dash}/>`
    );
  }

  for (let column = 0; column < columns; column += 1) {
    const number = column + 1;
    const x = gridX + column * cellSize + cellSize / 2;
    const weight = number % 5 === 0 ? 700 : 400;
    svg.push(
      `<text x="${x}" y="${gridY - axisOffset}" text-anchor="middle" dominant-baseline="central" font-size="${axisFontSize}" font-weight="${weight}" fill="#74717A">${number}</text>`,
      `<text x="${x}" y="${gridY + gridHeight + axisOffset}" text-anchor="middle" dominant-baseline="central" font-size="${axisFontSize}" font-weight="${weight}" fill="#74717A">${number}</text>`,
    );
  }
  for (let row = 0; row < rows; row += 1) {
    const number = row + 1;
    const y = gridY + row * cellSize + cellSize / 2;
    const weight = number % 5 === 0 ? 700 : 400;
    svg.push(
      `<text x="${gridX - axisOffset}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${axisFontSize}" font-weight="${weight}" fill="#74717A">${number}</text>`,
      `<text x="${gridX + gridWidth + axisOffset}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${axisFontSize}" font-weight="${weight}" fill="#74717A">${number}</text>`,
    );
  }

  colors.forEach((color, index) => {
    const legendRow = Math.floor(index / legendColumns);
    const legendColumn = index % legendColumns;
    const x = legendMargin + legendColumn * (legendCardWidth + legendGap);
    const y = legendTop + legendRow * (legendCardHeight + legendGap);
    const swatchSize = Math.min(48, legendCardHeight - 42);
    svg.push(
      `<rect x="${x}" y="${y}" width="${legendCardWidth}" height="${legendCardHeight}" rx="14" fill="#FCFCFD" stroke="#DDDDE2" stroke-width="2"/>`,
      `<rect x="${x + 16}" y="${y + 20}" width="${swatchSize}" height="${swatchSize}" rx="4" fill="${color.hex}" stroke="#A7A7AD" stroke-width="${color.hex === "#FFFFFF" ? 1.5 : 0}"/>`,
      `<text x="${x + 16 + swatchSize + 16}" y="${y + 43}" font-size="27" font-weight="700" fill="#34323A">${escapeXml(color.code)}</text>`,
      `<text x="${x + 16 + swatchSize + 16}" y="${y + 72}" font-size="17" fill="#77737D">${color.hex}</text>`,
      `<text x="${x + 16 + swatchSize + 16}" y="${y + 96}" font-size="17" fill="#77737D">${color.count} beads</text>`,
    );
  });

  svg.push(
    `<text x="${pageWidth / 2}" y="${footerY}" text-anchor="middle" font-size="22" fill="#77737D">MARD 221</text>`,
    "</g>",
    "</svg>",
  );
  return svg.join("\n");
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
      await runFile("/usr/bin/sips", ["-s", "format", "png", temporarySvg, "--out", options.output]);
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

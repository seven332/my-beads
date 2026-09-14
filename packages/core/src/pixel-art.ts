import type { PatternCell } from "./pattern.js";

export function renderPixelArtSvg(
  pattern: readonly (readonly PatternCell[])[],
  scale: number,
): string {
  if (!Number.isInteger(scale) || scale < 1 || scale > 512) {
    throw new Error("Scale must be an integer between 1 and 512");
  }
  const rows = pattern.length;
  const columns = pattern[0].length;
  const width = columns * scale;
  const height = rows * scale;
  if (width > 32_768 || height > 32_768) {
    throw new Error("Scaled output dimensions must not exceed 32768 pixels");
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`,
  ];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = pattern[row][column];
      if (cell.transparent) continue;
      svg.push(
        `<rect x="${column * scale}" y="${row * scale}" width="${scale}" height="${scale}" fill="${cell.hex}"/>`,
      );
    }
  }
  svg.push("</svg>");

  return svg.join("\n");
}

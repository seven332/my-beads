import { BeadError } from "./errors.js";
import type { PatternCell } from "./pattern.js";

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

export function renderChart(
  pattern: readonly (readonly PatternCell[])[],
  counts: ReadonlyMap<string, number>,
  title: string,
  pageWidth: number,
): string {
  if (!Number.isInteger(pageWidth) || pageWidth < 800 || pageWidth > 10_000) {
    throw new BeadError("chartWidth", "Chart width must be an integer between 800 and 10000");
  }
  const rows = pattern.length;
  const columns = pattern[0].length;
  // Keep multi-digit axis labels separated at the minimum 12px font size.
  const minimumCellSize = Math.max(20, String(columns).length * 8);
  const minimumWidth = Math.max(800, columns * minimumCellSize + 250);
  if (pageWidth < minimumWidth) {
    throw new BeadError("chartMinimum", `Chart needs a width of at least ${minimumWidth} pixels for ${columns} columns`, { width: minimumWidth, columns });
  }
  const colors = [...counts.entries()]
    .map(([code, count]) => ({ code, count, hex: pattern.flat().find((cell) => cell.code === code)!.hex }))
    .sort((left, right) => relativeLuminance(left.hex) - relativeLuminance(right.hex));
  const beadCount = colors.reduce((total, color) => total + color.count, 0);

  const cellSize = Math.floor(Math.min(48, (pageWidth - 250) / columns));
  const gridWidth = columns * cellSize;
  const gridHeight = rows * cellSize;
  const gridX = Math.round((pageWidth - gridWidth) / 2);
  const gridY = Math.max(190, Math.round(pageWidth * 0.08));
  const axisOffset = Math.max(24, Math.round(cellSize * 0.7));
  const legendTop = gridY + gridHeight + axisOffset + 46;
  const legendGap = Math.max(12, Math.round(pageWidth * 0.006));
  const legendMargin = Math.max(80, Math.round(pageWidth * 0.045));
  const maxLegendColumns = 9;
  const availableColumns = Math.floor((pageWidth - legendMargin * 2 + legendGap) / (220 + legendGap));
  const legendColumns = Math.max(1, Math.min(maxLegendColumns, availableColumns, colors.length));
  const legendCardWidth =
    (pageWidth - legendMargin * 2 - legendGap * (legendColumns - 1)) / legendColumns;
  const legendCardHeight = Math.max(104, Math.round(pageWidth * 0.046));
  const legendRows = Math.ceil(colors.length / legendColumns);
  const legendHeight = legendRows * legendCardHeight + Math.max(0, legendRows - 1) * legendGap;
  const footerY = legendTop + legendHeight + 50;
  const pageHeight = Math.ceil(footerY + 45);
  const cellFontSize = Math.max(8, Math.min(17, cellSize * 0.36));
  const axisFontSize = Math.max(12, Math.min(19, cellSize * 0.42));
  // Budget one em per character so wide letters fit without distorting the title.
  const titleFontSize = Math.min(52, (pageWidth - 100) / Math.max(1, title.length));
  const svg: string[] = [];

  svg.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}">`,
    `<rect width="${pageWidth}" height="${pageHeight}" fill="#FFFFFF"/>`,
    `<g font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', '.SF NS', 'Segoe UI', Arial, 'DejaVu Sans', sans-serif">`,
    `<text x="${pageWidth / 2}" y="62" text-anchor="middle" font-size="${titleFontSize}" font-weight="700" fill="#242229">${escapeXml(title)}</text>`,
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

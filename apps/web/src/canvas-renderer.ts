import { defaultPalette, type Point } from "@my-beads/core";
import type { CanvasTheme } from "./canvas-theme.js";
import type { EditorModel } from "./state.js";

// Bound RGBA storage to 64 MiB (excluding browser overhead), even on large displays.
const maxPixels = 16_777_216;
const maxDimension = 8192;

export type CanvasModel = Pick<
  EditorModel,
  "viewport" | "gridVisible" | "codesVisible" | "highlightedColor"
> & { document: Pick<EditorModel["document"], "grid"> };

export function canvasSize(width: number, height: number, dpr: number) {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const scale = Math.min(
    dpr,
    Math.sqrt(maxPixels / (width * height)),
    maxDimension / width,
    maxDimension / height,
  );
  const w = Math.max(1, Math.min(maxDimension, Math.round(width * scale)));
  const h = Math.max(1, Math.min(maxDimension, Math.round(height * scale)));
  return { width: w, height: Math.min(h, Math.floor(maxPixels / w)) };
}

export function paintCanvas(
  context: CanvasRenderingContext2D,
  model: CanvasModel,
  theme: CanvasTheme,
  cursor: Point | null,
) {
  const canvas = context.canvas;
  const { width, height } = canvas.getBoundingClientRect();
  const size = canvasSize(width, height, window.devicePixelRatio || 1);
  if (canvas.width !== size.width || canvas.height !== size.height) {
    canvas.width = size.width;
    canvas.height = size.height;
  }
  context.resetTransform();
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (width <= 0 || height <= 0) return;
  const scaleX = canvas.width / width,
    scaleY = canvas.height / height;
  const { zoom, x: left, y: top } = model.viewport;
  const grid = model.document.grid;
  const startX = Math.max(0, Math.floor(-left / zoom)),
    endX = Math.min(grid[0].length, Math.ceil((width - left) / zoom));
  const startY = Math.max(0, Math.floor(-top / zoom)),
    endY = Math.min(grid.length, Math.ceil((height - top) / zoom));
  if (startX >= endX || startY >= endY) return;

  // Adjacent cells must share rounded edges, not independently rounded widths.
  const xs = Array.from({ length: grid[0].length + 1 }, (_, x) =>
    Math.round((left + x * zoom) * scaleX),
  );
  const ys = Array.from({ length: grid.length + 1 }, (_, y) =>
    Math.round((top + y * zoom) * scaleY),
  );
  function fillCell(x: number, y: number) {
    context.fillRect(xs[x], ys[y], xs[x + 1] - xs[x], ys[y + 1] - ys[y]);
  }
  function cells(draw: (x: number, y: number) => void) {
    for (let y = startY; y < endY; y++) for (let x = startX; x < endX; x++) draw(x, y);
  }
  cells((x, y) => {
    const code = grid[y][x];
    context.fillStyle = code
      ? defaultPalette.colors[code]
      : (x + y) % 2
        ? theme.emptyB
        : theme.emptyA;
    fillCell(x, y);
  });

  if (model.gridVisible && zoom >= 6) {
    const wx = Math.max(1, Math.round(0.5 * scaleX)),
      wy = Math.max(1, Math.round(0.5 * scaleY));
    context.beginPath();
    for (let x = startX; x <= endX; x++)
      context.rect(xs[x] - Math.floor(wx / 2), ys[startY], wx, ys[endY] - ys[startY]);
    for (let y = startY; y <= endY; y++)
      context.rect(xs[startX], ys[y] - Math.floor(wy / 2), xs[endX] - xs[startX], wy);
    context.fillStyle = theme.grid;
    // One fill also avoids darkening translucent grid intersections twice.
    context.fill();
  }
  if (model.codesVisible && zoom >= 20) {
    context.save();
    context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    context.font = `600 ${Math.min(14, zoom * 0.3)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    cells((x, y) => {
      const code = grid[y][x];
      if (!code) return;
      const hex = defaultPalette.colors[code];
      const brightness = [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
      context.fillStyle = brightness > 420 ? "#202420" : "#ffffff";
      context.fillText(code, (xs[x] + xs[x + 1]) / 2 / scaleX, (ys[y] + ys[y + 1]) / 2 / scaleY);
    });
    context.restore();
  }
  if (model.highlightedColor) {
    context.fillStyle = theme.mask;
    cells((x, y) => {
      if (grid[y][x] !== model.highlightedColor) fillCell(x, y);
    });
    if (zoom >= 3) {
      const code = model.highlightedColor;
      function outline(cssWidth: number, color: string) {
        const wx = Math.max(1, Math.round(cssWidth * scaleX)),
          wy = Math.max(1, Math.round(cssWidth * scaleY));
        const dx = Math.floor(wx / 2),
          dy = Math.floor(wy / 2);
        context.beginPath();
        cells((x, y) => {
          if (grid[y][x] !== code) return;
          const l = xs[x],
            t = ys[y],
            r = xs[x + 1],
            b = ys[y + 1];
          if (l === r || t === b) return;
          // Inspect actual neighbors, including cells outside the visible viewport.
          if (grid[y - 1]?.[x] !== code) context.rect(l - dx, t - dy, r - l + wx, wy);
          if (grid[y + 1]?.[x] !== code) context.rect(l - dx, b - dy, r - l + wx, wy);
          if (grid[y][x - 1] !== code) context.rect(l - dx, t - dy, wx, b - t + wy);
          if (grid[y][x + 1] !== code) context.rect(r - dx, t - dy, wx, b - t + wy);
        });
        context.fillStyle = color;
        context.fill();
      }
      outline(Math.min(3, zoom * 0.45), theme.outlineDark);
      outline(Math.min(1, zoom * 0.15), theme.outlineLight);
    }
  }
  if (cursor) {
    const l = xs[cursor.x],
      t = ys[cursor.y];
    const w = xs[cursor.x + 1] - l,
      h = ys[cursor.y + 1] - t;
    if (w <= 0 || h <= 0) return;
    const wx = Math.min(w, Math.max(1, Math.round(2 * scaleX))),
      wy = Math.min(h, Math.max(1, Math.round(2 * scaleY)));
    context.beginPath();
    context.rect(l, t, w, wy);
    context.rect(l, t + h - wy, w, wy);
    context.rect(l, t, wx, h);
    context.rect(l + w - wx, t, wx, h);
    context.fillStyle = theme.selection;
    context.fill();
  }
}

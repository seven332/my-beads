import { defaultPalette, renderChart, serializePatternCsv, type PatternData } from "@my-beads/core";

export type ExportFormat = "csv" | "pixel" | "svg" | "chart";
export interface ExportOptions { format: ExportFormat; scale: number; width: number }
export function rasterBudget(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > 8192 || height > 8192 || width * height > 32_000_000) {
    throw new Error("PNG output is limited to 8192 pixels per side and 32 million pixels. Reduce the scale or chart width, or export SVG.");
  }
}
function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob); else reject(new Error("The browser could not encode this PNG."));
  }, "image/png"));
}
export async function exportPattern(document: PatternData, title: string, options: ExportOptions,
  signal: AbortSignal): Promise<{ blob: Blob; filename: string }> {
  signal.throwIfAborted();
  const name = title.trim().replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "pattern";
  if (options.format === "csv") return { blob: new Blob([serializePatternCsv(document.grid)], { type: "text/csv;charset=utf-8" }), filename: `${name}.csv` };
  let blob: Blob;
  if (options.format === "pixel") {
    if (!Number.isInteger(options.scale) || options.scale < 1 || options.scale > 512) throw new Error("Pixel scale must be an integer from 1 to 512.");
    const width = document.grid[0].length * options.scale, height = document.grid.length * options.scale;
    rasterBudget(width, height);
    const canvas = window.document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable in this browser.");
    document.grid.forEach((row, y) => row.forEach((code, x) => {
      if (code) { context.fillStyle = defaultPalette.colors[code]; context.fillRect(x * options.scale, y * options.scale, options.scale, options.scale); }
    }));
    blob = await png(canvas);
    signal.throwIfAborted();
  } else {
    const svg = renderChart(document.pattern, document.counts, title, options.width);
    blob = new Blob([svg], { type: "image/svg+xml" });
    if (options.format === "svg") return { blob, filename: `${name}-chart.svg` };
    const size = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
    const width = Number(size.getAttribute("width")), height = Number(size.getAttribute("height"));
    rasterBudget(width, height);
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { signal.removeEventListener("abort", abort); image.onload = null; image.onerror = null; };
        const abort = () => { cleanup(); image.src = ""; reject(signal.reason); };
        image.onload = () => { cleanup(); resolve(); };
        image.onerror = () => { cleanup(); reject(new Error("The browser could not render the chart.")); };
        signal.addEventListener("abort", abort, { once: true });
        image.src = url;
      });
      signal.throwIfAborted();
      const canvas = window.document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable in this browser.");
      context.drawImage(image, 0, 0);
      blob = await png(canvas);
      signal.throwIfAborted();
    } finally { URL.revokeObjectURL(url); }
  }
  return { blob, filename: `${name}-${options.format === "pixel" ? "pixel-art" : "chart"}.png` };
}

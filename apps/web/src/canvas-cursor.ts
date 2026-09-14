import {
  Eraser,
  PaintBucket,
  Pencil,
  Pipette,
  type LucideIconData,
  type LucideIconNode,
} from "@lucide/icons";
import type { Tool } from "./state.js";

// Only trusted, statically imported Lucide data enters these SVGs.
function svgNode([tag, attrs, children]: LucideIconNode): string {
  const attributes = Object.entries(attrs)
    .filter(([name]) => name !== "key")
    .map(
      ([name, value]) =>
        `${name}="${String(value).replace(/[&"<>]/g, (char) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[char]!)}"`,
    )
    .join(" ");
  return `<${tag} ${attributes}>${children?.map(svgNode).join("") ?? ""}</${tag}>`;
}

function imageCursor(icon: LucideIconData, x: number, y: number): string {
  const shapes = icon.node.map(svgNode).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(4 4)"><g stroke="white" stroke-width="4">${shapes}</g><g stroke="black" stroke-width="2">${shapes}</g></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, crosshair`;
}

// Image-pixel hotspots: drawing/picking tips, eraser contact edge, bucket drop tip.
// Cache once; neither pointer movement nor canvas zoom regenerates the images.
const toolCursors: Record<Tool, string> = {
  pencil: imageCursor(Pencil, 6, 26),
  eraser: imageCursor(Eraser, 12, 25),
  bucket: imageCursor(PaintBucket, 24, 26),
  eyedropper: imageCursor(Pipette, 6, 26),
  pan: "grab",
};

export function canvasCursor(tool: Tool, panning: boolean): string {
  return panning ? "grabbing" : toolCursors[tool];
}

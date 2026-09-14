export interface ViewArea {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type CanvasEdge = "top" | "right" | "bottom" | "left";
export interface Obstruction extends ViewArea {
  edge: CanvasEdge;
}

/** A central rectangle clear of the stationary controls, in Canvas coordinates. */
export function unobscuredArea(canvas: ViewArea, panels: readonly Obstruction[]): ViewArea {
  let left = 0,
    top = 0,
    right = canvas.width,
    bottom = canvas.height;
  for (const panel of panels) {
    const x = panel.x - canvas.x,
      y = panel.y - canvas.y;
    if (
      panel.width <= 0 ||
      panel.height <= 0 ||
      x >= canvas.width ||
      y >= canvas.height ||
      x + panel.width <= 0 ||
      y + panel.height <= 0
    )
      continue;
    if (panel.edge === "left") left = Math.max(left, x + panel.width);
    if (panel.edge === "right") right = Math.min(right, x);
    if (panel.edge === "top") top = Math.max(top, y + panel.height);
    if (panel.edge === "bottom") bottom = Math.min(bottom, y);
  }
  left = Math.max(0, Math.min(left, canvas.width - 1));
  top = Math.max(0, Math.min(top, canvas.height - 1));
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export function editingArea(host: HTMLElement): ViewArea | undefined {
  const canvas = host.querySelector<HTMLCanvasElement>(".pattern-canvas");
  if (!canvas) return;
  const panels: Obstruction[] = [];
  for (const panel of host.querySelectorAll<HTMLElement>("[data-canvas-panel]")) {
    const style = getComputedStyle(panel),
      edge = style.getPropertyValue("--canvas-edge").trim();
    if (style.display === "none" || style.visibility === "hidden") continue;
    if (edge === "top" || edge === "right" || edge === "bottom" || edge === "left") {
      const { x, y, width, height } = panel.getBoundingClientRect();
      panels.push({ edge, x, y, width, height });
    }
  }
  return unobscuredArea(canvas.getBoundingClientRect(), panels);
}

export function paletteIsOverlay(host: HTMLElement): boolean {
  const toggle = host.querySelector<HTMLElement>(".palette-toggle");
  return !!toggle && getComputedStyle(toggle).display !== "none";
}

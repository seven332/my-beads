/** Presentation values only; bead fills and code-label contrast come from MARD data. */
export function readCanvasTheme(canvas: HTMLCanvasElement) {
  const style = getComputedStyle(canvas);
  const color = (name: string) => style.getPropertyValue(`--ui-canvas-${name}`).trim();
  return {
    emptyA: color("empty-a"),
    emptyB: color("empty-b"),
    grid: color("grid"),
    mask: color("mask"),
    outlineDark: color("outline-dark"),
    outlineLight: color("outline-light"),
    selection: color("selection"),
  };
}
export type CanvasTheme = ReturnType<typeof readCanvasTheme>;

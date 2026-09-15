import { expect, test } from "@playwright/test";
import type { CanvasModel } from "../src/canvas-renderer.js";

for (const dpr of [1, 1.25, 2, 3]) {
  test.describe(`canvas raster at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });

    test("fractional cells, masks and guides retain their intended pixel colors", async ({
      page,
    }) => {
      await page.goto("/");
      const result = await page.evaluate(async () => {
        // Exercise the production drawing routine in a real browser with controlled geometry.
        const modulePath = "/src/canvas-renderer.ts";
        const { paintCanvas } = (await import(
          modulePath
        )) as typeof import("../src/canvas-renderer.js");
        const canvas = document.createElement("canvas");
        canvas.style.cssText = "width:120.5px;height:100.25px;display:block";
        document.body.append(canvas);
        const context = canvas.getContext("2d")!;
        const theme = {
          emptyA: "#f5f6f2",
          emptyB: "#e4e6e3",
          grid: "#ffffff80",
          mask: "#ffffff80",
          outlineDark: "#ff0000",
          outlineLight: "#ffffff",
          selection: "#ef7540",
        };
        const solid = (n: number) =>
          Array.from({ length: n }, () => Array<string | null>(n).fill("H7"));
        const model: CanvasModel = {
          viewport: { zoom: 8.25, x: 10.25, y: 10.25 },
          document: { grid: solid(8) },
          gridVisible: false,
          codesVisible: false,
          highlightedColor: null,
        };
        function colors() {
          const { width, height } = canvas.getBoundingClientRect();
          const sx = canvas.width / width,
            sy = canvas.height / height;
          const { x, y, zoom } = model.viewport;
          const l = Math.max(0, Math.round(x * sx)),
            t = Math.max(0, Math.round(y * sy));
          const r = Math.min(
            canvas.width,
            Math.round((x + model.document.grid[0].length * zoom) * sx),
          );
          const b = Math.min(
            canvas.height,
            Math.round((y + model.document.grid.length * zoom) * sy),
          );
          const data = context.getImageData(l, t, r - l, b - t).data;
          const values = new Set<string>();
          for (let i = 0; i < data.length; i += 4) values.add([...data.slice(i, i + 4)].join(","));
          return [...values].sort();
        }
        const opaque: string[][] = [],
          alternating: string[][] = [],
          empty: string[][] = [];
        try {
          // Includes clipped cells and cells smaller than one backing pixel.
          for (const view of [
            { zoom: 8.25, x: 10.25, y: 10.25 },
            { zoom: 11.375, x: -15.6, y: -12.3 },
            { zoom: 0.25, x: 10.25, y: 10.25 },
          ]) {
            model.viewport = view;
            model.document = { grid: solid(8) };
            paintCanvas(context, model, theme, null);
            opaque.push(colors());
            model.document = {
              grid: solid(8).map((row, y) => row.map((_, x) => ((x + y) % 2 ? "H7" : "H2"))),
            };
            paintCanvas(context, model, theme, null);
            alternating.push(colors());
            model.document = { grid: solid(8).map((row) => row.map(() => null)) };
            paintCanvas(context, model, theme, null);
            empty.push(colors());
          }
          model.viewport = { zoom: 8.25, x: 10.25, y: 10.25 };
          model.document = { grid: solid(8) };
          model.highlightedColor = "H2";
          paintCanvas(context, model, theme, null);
          const mask = colors();
          model.highlightedColor = null;
          model.gridVisible = true;
          paintCanvas(context, model, theme, null);
          const grid = colors();
          model.gridVisible = false;
          paintCanvas(context, model, theme, { x: 2, y: 2 });
          const selection = colors();
          model.highlightedColor = "H7";
          paintCanvas(context, model, theme, null);
          const outline = colors();
          model.document = { grid: solid(30) };
          model.viewport = { zoom: 8.25, x: -16.25, y: -15.25 };
          paintCanvas(context, model, theme, null);
          const clippedOutline = colors();
          model.highlightedColor = null;
          model.document = { grid: solid(2) };
          model.viewport = { zoom: 32.5, x: 10.25, y: 10.25 };
          model.codesVisible = true;
          paintCanvas(context, model, theme, null);
          const text = colors().map((value) => value.split(",").map(Number));
          return {
            size: [canvas.width, canvas.height],
            opaque,
            alternating,
            empty,
            mask,
            grid,
            selection,
            outline,
            clippedOutline,
            textOpaque: text.every((value) => value[3] === 255),
            textSmoothed: text.some((value) => value[0] > 0 && value[0] < 255),
          };
        } finally {
          canvas.remove();
        }
      });
      expect(result.size).toEqual([Math.round(120.5 * dpr), Math.round(100.25 * dpr)]);
      for (const colors of result.opaque) expect(colors).toEqual(["0,0,0,255"]);
      for (const colors of result.alternating) {
        expect(colors.length).toBeGreaterThan(0);
        expect(colors.every((color) => ["0,0,0,255", "255,255,255,255"].includes(color))).toBe(
          true,
        );
      }
      for (const colors of result.empty)
        expect(
          colors.every((color) => ["245,246,242,255", "228,230,227,255"].includes(color)),
        ).toBe(true);
      expect(result.mask).toEqual(["128,128,128,255"]);
      expect(result.grid).toEqual(["0,0,0,255", "128,128,128,255"]);
      expect(result.selection).toEqual(["0,0,0,255", "239,117,64,255"]);
      expect(result.outline).toEqual(["0,0,0,255", "255,0,0,255", "255,255,255,255"]);
      expect(result.clippedOutline).toEqual(["0,0,0,255"]);
      expect(result.textOpaque).toBe(true);
      expect(result.textSmoothed).toBe(true);
    });
  });
}

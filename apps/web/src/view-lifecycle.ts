import { createRef } from "lit-html/directives/ref.js";
import { defaultPalette, type PatternGrid } from "@my-beads/core";
import { mountCanvas, type CanvasActions } from "./canvas.js";
import type { EditorModel } from "./state.js";
import type { ImageSession } from "./image-state.js";
import { readCanvasTheme, type CanvasTheme } from "./canvas-theme.js";
import type { Theme } from "./theme-preference.js";

export type ViewRefs = ReturnType<typeof createViewLifecycle>["refs"];

/** Refs identify nodes; resource effects run only after synchronous render inserts them. */
export function createViewLifecycle(actions: CanvasActions) {
  const refs = {
    canvas: createRef<HTMLCanvasElement>(),
    imageDialog: createRef<HTMLDialogElement>(),
    exportDialog: createRef<HTMLDialogElement>(),
    keyboardDialog: createRef<HTMLDialogElement>(),
    sourcePreview: createRef<HTMLCanvasElement>(),
    mappedPreview: createRef<HTMLCanvasElement>(),
  };
  let canvas:
    | {
        element: HTMLCanvasElement;
        controller: ReturnType<typeof mountCanvas>;
        theme: Theme;
        colors: CanvasTheme;
      }
    | undefined;
  let dialogs: HTMLDialogElement[] = [];
  const previews = new Map<HTMLCanvasElement, PatternGrid>();
  function releaseCanvas() {
    const previous = canvas;
    canvas = undefined;
    previous?.controller.destroy();
  }
  function paint(
    element: HTMLCanvasElement | undefined,
    grid: PatternGrid | undefined,
    mapped: boolean,
  ) {
    if (!element || !grid || previews.get(element) === grid) return;
    element.width = grid[0].length;
    element.height = grid.length;
    const context = element.getContext("2d");
    if (context)
      grid.forEach((row, y) =>
        row.forEach((color, x) => {
          if (color) {
            context.fillStyle = mapped ? defaultPalette.colors[color] : color;
            context.fillRect(x, y, 1, 1);
          }
        }),
      );
    previews.set(element, grid);
  }
  return {
    refs,
    interacting() {
      return canvas?.controller.interacting() ?? false;
    },
    holdPan(held: boolean) {
      canvas?.controller.holdPan(held);
    },
    sync(model: EditorModel, image: ImageSession | null, theme: Theme) {
      if (canvas?.element !== refs.canvas.value) {
        releaseCanvas();
        if (refs.canvas.value)
          canvas = {
            element: refs.canvas.value,
            controller: mountCanvas(refs.canvas.value, actions),
            theme,
            colors: readCanvasTheme(refs.canvas.value),
          };
      }
      if (canvas) {
        if (canvas.theme !== theme) {
          canvas.theme = theme;
          canvas.colors = readCanvasTheme(canvas.element);
        }
        canvas.controller.update(model, canvas.colors);
      }
      const previous = dialogs;
      dialogs = [refs.imageDialog.value, refs.exportDialog.value, refs.keyboardDialog.value].filter(
        (dialog): dialog is HTMLDialogElement => !!dialog,
      );
      for (const dialog of previous) if (!dialogs.includes(dialog)) dialog.close();
      for (const dialog of dialogs) if (!dialog.open) dialog.showModal();
      for (const element of previews.keys())
        if (element !== refs.sourcePreview.value && element !== refs.mappedPreview.value)
          previews.delete(element);
      paint(refs.sourcePreview.value, image?.sample?.grid, false);
      paint(refs.mappedPreview.value, image?.mapped?.grid, true);
    },
    destroy() {
      releaseCanvas();
      for (const dialog of dialogs) dialog.close();
      dialogs = [];
      previews.clear();
    },
  };
}

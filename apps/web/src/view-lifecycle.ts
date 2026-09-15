import { createRef } from "lit-html/directives/ref.js";
import { defaultPalette, type PatternGrid } from "@my-beads/core";
import { mountCanvas, type CanvasActions } from "./canvas.js";
import type { EditorModel } from "./state.js";
import type { ImageSession } from "./image-state.js";
import { readCanvasTheme, type CanvasTheme } from "./canvas-theme.js";
import type { Theme } from "./theme-preference.js";
import { mountColorArea } from "./color-area.js";
import { mountColorPickerOverlay } from "./color-picker-overlay.js";
import { mountSelects } from "./ui/select-controller.js";

export type ViewRefs = ReturnType<typeof createViewLifecycle>["refs"];

/** Refs identify nodes; resource effects run only after synchronous render inserts them. */
export function createViewLifecycle(
  host: HTMLElement,
  actions: CanvasActions,
  pickColor: (saturation: number, brightness: number) => void,
  dismissColorPicker: (restoreFocus: boolean) => void,
) {
  const selects = mountSelects(host);
  const refs = {
    canvas: createRef<HTMLCanvasElement>(),
    imageDialog: createRef<HTMLDialogElement>(),
    exportDialog: createRef<HTMLDialogElement>(),
    keyboardDialog: createRef<HTMLDialogElement>(),
    sourcePreview: createRef<HTMLCanvasElement>(),
    mappedPreview: createRef<HTMLCanvasElement>(),
    colorArea: createRef<HTMLElement>(),
    colorHue: createRef<HTMLInputElement>(),
    colorSearch: createRef<HTMLElement>(),
    colorDialog: createRef<HTMLDialogElement>(),
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
  let picker:
    | {
        element: HTMLDialogElement;
        compact: boolean;
        controller: ReturnType<typeof mountColorPickerOverlay>;
      }
    | undefined;
  let colorArea:
    | { element: HTMLElement; hue: HTMLInputElement; controller: ReturnType<typeof mountColorArea> }
    | undefined;
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
      if (picker?.element !== refs.colorDialog.value) {
        picker?.controller.destroy();
        picker =
          refs.colorDialog.value && refs.colorSearch.value
            ? {
                element: refs.colorDialog.value,
                compact: model.colorPicker.compact,
                controller: mountColorPickerOverlay(
                  refs.colorDialog.value,
                  refs.colorSearch.value,
                  dismissColorPicker,
                ),
              }
            : undefined;
      }
      if (picker) {
        if (picker.compact !== model.colorPicker.compact) {
          selects.close();
          colorArea?.controller.cancel();
        }
        picker.compact = model.colorPicker.compact;
        picker.controller.sync(picker.compact);
      }
      if (colorArea?.element !== refs.colorArea.value || colorArea?.hue !== refs.colorHue.value) {
        colorArea?.controller.destroy();
        colorArea =
          refs.colorArea.value && refs.colorHue.value
            ? {
                element: refs.colorArea.value,
                hue: refs.colorHue.value,
                controller: mountColorArea(refs.colorArea.value, refs.colorHue.value, pickColor),
              }
            : undefined;
      }
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
      selects.sync();
      for (const element of previews.keys())
        if (element !== refs.sourcePreview.value && element !== refs.mappedPreview.value)
          previews.delete(element);
      paint(refs.sourcePreview.value, image?.sample?.grid, false);
      paint(refs.mappedPreview.value, image?.mapped?.grid, true);
    },
    destroy() {
      selects.destroy();
      colorArea?.controller.destroy();
      colorArea = undefined;
      picker?.controller.destroy();
      picker = undefined;
      releaseCanvas();
      for (const dialog of dialogs) dialog.close();
      dialogs = [];
      previews.clear();
    },
  };
}

import { h, type Hooks, type VNode } from "snabbdom";
import { defaultPalette } from "@my-beads/core";
import type { EditorModel } from "./state.js";
import type { Actions } from "./view.js";
import type { Translate } from "./i18n/index.js";
import { paletteResults } from "./palette-view.js";
import { Download, Eraser, Hand, Minus, PaintBucket, Pencil, Pipette, Plus, Redo2, Undo2, X } from "@lucide/icons";
import { icon } from "./icon.js";

function button(label: string | VNode | (string | VNode)[], action: () => void, attrs: Record<string, string | boolean> = {}, className = "") {
  return h("button", { attrs: { type: "button", class: className,
    ...Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, name.startsWith("aria-") ? String(value) : value])) }, on: { click: action } }, label);
}

export function editorView(model: EditorModel, actions: Actions, canvasHooks: Hooks, t: Translate,
  brand: VNode, language: VNode, draft: VNode, exporting: boolean): VNode {
  const grid = model.document.grid;
  return h("main.editor-layout", { key: "edit", attrs: { "aria-label": t($ => $.app.workspace), "data-palette-open": String(model.paletteOpen) } }, [
    h("div.canvas-container", [h("canvas.pattern-canvas", { key: "pattern-canvas", hook: canvasHooks,
      attrs: { tabindex: "0", role: "img", "aria-label": t($ => $.app.canvas), "aria-describedby": "canvas-help" } })]),
    h("header.editor-topbar", [
      h("div.editor-document.floating-panel", { attrs: { "data-canvas-panel": "" } }, [brand,
        h("input.title-input", { attrs: { "aria-label": t($ => $.app.patternTitle), maxlength: "100" }, props: { value: model.title },
          on: { input: (event: Event) => actions.rename((event.target as HTMLInputElement).value) } }),
      ]),
      h("div.editor-actions.floating-panel", { attrs: { "data-canvas-panel": "" } }, [language,
        h("div.document-actions", [button(t($ => $.create.new), actions.startNew),
          button([icon(Download), h("span", t($ => $.export.open))], actions.openExport, { "aria-label": t($ => $.export.open) }, "primary with-icon")]),
      ]),
    ]),
    h("div.editor-dock", { attrs: { "data-canvas-panel": "" } }, [
      h("div.editor-tools.floating-panel", { attrs: { "data-canvas-panel": "" } }, [
        h("div.tools", { attrs: { role: "group", "aria-label": t($ => $.app.tools) } }, ([
          ["pencil", Pencil], ["eraser", Eraser], ["bucket", PaintBucket], ["eyedropper", Pipette], ["pan", Hand],
        ] as const).map(([tool, graphic]) => {
          const label = tool === "bucket" ? t($ => $.tools.bucketLabel) : tool === "eyedropper" ? t($ => $.tools.eyedropperLabel) : t($ => $.tools[tool]);
          return h("button.tool", { attrs: { type: "button", "aria-label": label, title: label, "aria-pressed": String(model.tool === tool) },
            on: { click: () => actions.tool(tool) } }, [h("span.tool-icon", [icon(graphic)]), h("span.tool-label", t($ => $.tools[tool]))]);
        })),
        h("div.history-controls", [button(icon(Undo2), actions.undo, { disabled: !model.canUndo, "aria-label": t($ => $.app.undo), title: t($ => $.app.undo) }),
          button(icon(Redo2), actions.redo, { disabled: !model.canRedo, "aria-label": t($ => $.app.redo), title: t($ => $.app.redo) })]),
      ]),
      h("div.editor-navigation.floating-panel", { attrs: { "data-canvas-panel": "" } }, [
        h("button.palette-toggle", { attrs: { type: "button", "aria-label": t($ => $.palette.open), "aria-controls": "editor-palette", "aria-expanded": String(model.paletteOpen) },
          on: { click: () => actions.palette(!model.paletteOpen) } }, [h("span.color-swatch", { attrs: { style: `background:${defaultPalette.colors[model.color]}` } }), h("span", model.color)]),
        h("div.display-controls", [button(t($ => $.app.grid), actions.grid, { "aria-pressed": model.gridVisible }), button(t($ => $.app.codes), actions.codes, { "aria-pressed": model.codesVisible })]),
        h("div.zoom-controls", [button(icon(Minus), () => actions.zoom(1 / 1.25), { "aria-label": t($ => $.app.zoomOut) }),
          h("output", { attrs: { "aria-label": t($ => $.app.zoomLevel) } }, `${Math.round(model.viewport.zoom / 12 * 100)}%`),
          button(icon(Plus), () => actions.zoom(1.25), { "aria-label": t($ => $.app.zoomIn) }), button(t($ => $.app.fit), actions.fit, { "aria-label": t($ => $.app.fitWindow) })]),
      ]),
    ]),
    h("aside.palette-panel.floating-panel", { attrs: { id: "editor-palette", "aria-label": t($ => $.palette.heading), "data-canvas-panel": "" } }, [
      h("div.section-heading", [h("h2", t($ => $.palette.heading)), h("span.tag", "MARD 221"),
        button(icon(X), () => actions.palette(false), { "aria-label": t($ => $.palette.close) }, "palette-close icon-button")]),
      h("div.selected-color", [h("span.selected-swatch", { attrs: { style: `background:${defaultPalette.colors[model.color]}` } }),
        h("div", [h("strong", model.color), h("span", defaultPalette.colors[model.color])]),
        h("span.selected-count", t($ => $.beads, { count: model.document.counts.get(model.color) ?? 0 }))]),
      h("input.palette-search", { attrs: { type: "search", placeholder: t($ => $.palette.searchPlaceholder), "aria-label": t($ => $.palette.search) },
        props: { value: model.search }, on: { input: (event: Event) => actions.search((event.target as HTMLInputElement).value) } }),
      paletteResults(model.paletteSearch, model.color, model.document.counts, actions.color, t),
    ]),
    h("div.editor-status.floating-panel", { attrs: { "data-canvas-panel": "" } }, [
      h("div.canvas-status", [h("span", t($ => $.app.dimensions, { columns: grid[0].length, rows: grid.length })),
        h("span.counts", { attrs: { "data-testid": "counts" } }, `${t($ => $.beads, { count: model.beads })} · ${t($ => $.colors, { count: model.document.counts.size })}`)]),
      draft,
    ]),
    h("p.canvas-help.sr-only", { attrs: { id: "canvas-help" } }, t($ => $.app.canvasHelp)),
    model.error && !exporting ? h("p.editor-error.error.floating-panel", { attrs: { role: "alert", "data-canvas-panel": "" } }, model.error) : h("span.editor-placeholder"),
  ]);
}

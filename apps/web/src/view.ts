import { h, type VNode, type Hooks } from "snabbdom";
import { defaultPalette } from "@my-beads/core";
import type { EditorModel, Tool } from "./state.js";
import type { ExportOptions } from "./exports.js";
import { imagePicker, imageView, type ImageActions } from "./image-view.js";
import type { ImageSession } from "./image-state.js";
import type { DraftStatus } from "./drafts.js";

export interface Actions extends ImageActions {
  tool(tool: Tool): void; color(code: string): void; search(value: string): void;
  rename(value: string): void; create(width: number, height: number): void; import(file: File): void;
  undo(): void; redo(): void; grid(): void; codes(): void; zoom(factor: number): void; fit(): void;
  export(options: ExportOptions): void;
  saveDraft(): void;
}
function value(event: Event) { return (event.target as HTMLInputElement).value; }
function button(label: string, action: () => void, attrs: Record<string, string | boolean> = {}, className = "") {
  return h("button", { attrs: { type: "button", class: className.replace(/^\./, ""),
    ...Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, name.startsWith("aria-") ? String(value) : value])) }, on: { click: action } }, label);
}
function field(label: string, name: string, initial: string, attrs: Record<string, string | number> = {}) {
  return h("label.field", [h("span", label), h("input", { attrs: { name, ...attrs }, props: { defaultValue: initial } })]);
}
export function view(model: EditorModel, actions: Actions, canvasHooks: Hooks, image: ImageSession | null, draft: DraftStatus): VNode {
  const grid = model.document.grid;
  return h("div.workspace", [
    h("header.topbar", [
      h("a.brand", { attrs: { href: "#", "aria-label": "My Beads" } }, [h("span.brand-mark", "▦"), h("span", "My Beads")]),
      h("span.topbar-note", "A little color. One bead at a time."),
      h("div.import-actions", [h("label.import-button", [h("span", "↑  Open CSV"), h("input.file-input", { attrs: { type: "file", accept: ".csv,text/csv", "aria-label": "Open CSV" },
        on: { change: (event: Event) => { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (file) actions.import(file); input.value = ""; } } })]),
        imagePicker("↑  Open image", "Open image", actions.importImage)]),
    ]),
    h("div.draft-status", { attrs: { role: draft.error ? "alert" : "status", "aria-label": "Draft status" } }, [
      h("span", draft.message), draft.action ? button(draft.action === "replace" ? "Replace saved draft" : "Retry saving draft", actions.saveDraft) : h("span"),
    ]),
    h("main.editor-layout", [
      h("section.drawing-panel", { attrs: { "aria-label": "Pattern workspace" } }, [
        h("div.document-bar", [
          h("div.document-name", [h("span.eyebrow", "PATTERN STUDIO"), h("input.title-input", { attrs: { "aria-label": "Pattern title", maxlength: "100" }, props: { value: model.title }, on: { input: (e: Event) => actions.rename(value(e)) } })]),
          h("div.history-controls", [button("↶ Undo", actions.undo, { disabled: !model.canUndo }), button("↷ Redo", actions.redo, { disabled: !model.canRedo })]),
        ]),
        h("div.canvas-toolbar", [
          h("div.tools", { attrs: { role: "group", "aria-label": "Drawing tools" } }, ([
            ["pencil", "✎", "Pencil"], ["eraser", "◇", "Eraser"], ["bucket", "▨", "Fill"],
            ["eyedropper", "⌖", "Pick"], ["pan", "✥", "Pan"],
          ] as const).map(([tool, icon, label]) => button(`${icon} ${label}`, () => actions.tool(tool), { "aria-label": tool === "bucket" ? "Paint bucket" : tool === "eyedropper" ? "Eyedropper" : label, "aria-pressed": model.tool === tool }, model.tool === tool ? ".active" : ""))),
          h("div.display-controls", [button("Grid", actions.grid, { "aria-pressed": model.gridVisible }), button("Codes", actions.codes, { "aria-pressed": model.codesVisible })]),
        ]),
        h("div.canvas-container", [h("canvas.pattern-canvas", { key: "pattern-canvas", hook: canvasHooks, attrs: { tabindex: "0", role: "img", "aria-label": "Pattern canvas", "aria-describedby": "canvas-help" } })]),
        h("div.canvas-status", [
          h("span", `${grid[0].length} × ${grid.length} cells`),
          h("span.counts", { attrs: { "data-testid": "counts" } }, `${model.beads.toLocaleString("en-US")} beads · ${model.document.counts.size} colors`),
          h("div.zoom-controls", [button("−", () => actions.zoom(1 / 1.25), { "aria-label": "Zoom out" }), h("output", { attrs: { "aria-label": "Zoom level" } }, `${Math.round(model.viewport.zoom / 12 * 100)}%`), button("+", () => actions.zoom(1.25), { "aria-label": "Zoom in" }), button("Fit", actions.fit, { "aria-label": "Fit to window" })]),
        ]),
        h("p.canvas-help", { attrs: { id: "canvas-help" } }, "Scroll to pan · Pinch to zoom · Middle-drag to pan · Arrow keys + Enter to draw · Shift + arrows to pan"),
        model.error ? h("p.error", { key: "error", attrs: { role: "alert" } }, model.error) : h("span", { key: "error" }),
      ]),
      h("aside.sidebar", [
        h("section.palette-panel", [
          h("div.section-heading", [h("h2", "Your palette"), h("span.tag", "MARD 221")]),
          h("div.selected-color", [h("span.selected-swatch", { attrs: { style: `background:${defaultPalette.colors[model.color]}` } }),
            h("div", [h("strong", model.color), h("span", defaultPalette.colors[model.color])]), h("span.selected-count", `${model.document.counts.get(model.color) ?? 0} beads`)]),
          h("input.palette-search", { attrs: { type: "search", placeholder: "Search code or hex…", "aria-label": "Search colors" }, props: { value: model.search }, on: { input: (e: Event) => actions.search(value(e)) } }),
          h("div.palette-grid", { attrs: { "aria-label": "MARD colors" } }, model.palette.map(([code, hex]) =>
            h("button.color", { key: code, attrs: { type: "button", "aria-label": `${code} ${hex}`, "aria-pressed": String(model.color === code), title: `${code} · ${hex} · ${model.document.counts.get(code) ?? 0} beads` }, on: { click: () => actions.color(code) } }, [
              h("span.color-swatch", { attrs: { style: `background:${hex}` } }), h("span.color-code", code), h("span.color-count", String(model.document.counts.get(code) || "·")),
            ]))),
          model.palette.length ? h("span") : h("p.empty-results", "No matching colors."),
        ]),
        h("details.export-panel", { attrs: { open: true } }, [h("summary", "Export pattern"),
          // The export adapter validates only the selected format's settings.
          h("form.export-form", { attrs: { novalidate: true }, on: { submit: (event: Event) => { event.preventDefault(); const data = new FormData(event.target as HTMLFormElement); actions.export({ format: data.get("format") as ExportOptions["format"], scale: Number(data.get("scale")), width: Number(data.get("width")) }); } } }, [
            h("label.field", [h("span", "Format"), h("select", { attrs: { name: "format", "aria-label": "Export format" } }, [h("option", { attrs: { value: "csv" } }, "CSV grid"), h("option", { attrs: { value: "pixel" } }, "Pixel art PNG"), h("option", { attrs: { value: "svg" } }, "Printable SVG"), h("option", { attrs: { value: "chart" } }, "Printable PNG")])]),
            h("div.field-row", [field("Pixel scale", "scale", "16", { type: "number", min: 1, max: 512 }), field("Chart width", "width", "2400", { type: "number", min: 800, max: 10000 })]),
            h("button.primary", { attrs: { type: "submit" } }, "↓  Download"),
          ]),
        ]),
        h("details.new-panel", [h("summary", "Start a new pattern"), h("form", { on: { submit: (event: Event) => { event.preventDefault(); const data = new FormData(event.target as HTMLFormElement); actions.create(Number(data.get("columns")), Number(data.get("rows"))); } } }, [
          h("div.field-row", [field("Columns", "columns", "50", { type: "number", min: 1, max: 256 }), field("Rows", "rows", "50", { type: "number", min: 1, max: 256 })]),
          h("p.muted", "Replaces the current pattern. Download your work first."), h("button", { attrs: { type: "submit" } }, "Create blank grid"),
        ])]),
      ]),
    ]),
    h("footer.app-footer", [h("span", "Made for the joy of making."), h("span", "Local files · MARD 221")]),
    imageView(image, actions),
  ]);
}

import { h, type VNode, type Hooks } from "snabbdom";
import { defaultPalette } from "@my-beads/core";
import type { EditorModel, Tool } from "./state.js";
import type { ExportOptions } from "./exports.js";
import { imagePicker, imageView, type ImageActions } from "./image-view.js";
import type { ImageSession } from "./image-state.js";
import type { DraftStatus } from "./drafts.js";
import { isLocale, localeNames, type Locale, type Translate } from "./i18n/index.js";
import { paletteResults } from "./palette-view.js";

export interface Actions extends ImageActions {
  tool(tool: Tool): void; color(code: string): void; search(value: string): void;
  rename(value: string): void; create(width: number, height: number): void; import(file: File): void;
  undo(): void; redo(): void; grid(): void; codes(): void; zoom(factor: number): void; fit(): void;
  export(options: ExportOptions): void;
  saveDraft(): void; language(locale: Locale): void;
}
function value(event: Event) { return (event.target as HTMLInputElement).value; }
function button(label: string, action: () => void, attrs: Record<string, string | boolean> = {}, className = "") {
  return h("button", { attrs: { type: "button", class: className.replace(/^\./, ""),
    ...Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, name.startsWith("aria-") ? String(value) : value])) }, on: { click: action } }, label);
}
function field(label: string, name: string, initial: string, attrs: Record<string, string | number> = {}) {
  return h("label.field", [h("span", label), h("input", { attrs: { name, ...attrs }, props: { defaultValue: initial } })]);
}
export function view(model: EditorModel, actions: Actions, canvasHooks: Hooks, image: ImageSession | null, draft: DraftStatus & { message: string }, locale: Locale, t: Translate): VNode {
  const grid = model.document.grid;
  return h("div.workspace", { attrs: { lang: locale } }, [
    h("header.topbar", [
      h("a.brand", { attrs: { href: "#", "aria-label": t($ => $.app.name) } }, [h("span.brand-mark", "▦"), h("span", t($ => $.app.name))]),
      h("span.topbar-note", t($ => $.app.tagline)),
      h("label.language-picker", [h("span", t($ => $.app.language)),
        h("select", { attrs: { "aria-label": t($ => $.app.language) }, props: { value: locale },
          on: { change: (event: Event) => { const selected = value(event); if (isLocale(selected)) actions.language(selected); } } },
        Object.entries(localeNames).map(([code, name]) => h("option", { attrs: { value: code, lang: code }, props: { selected: code === locale } }, name)))]),
      h("div.import-actions", [h("label.import-button", [h("span", `↑  ${t($ => $.app.openCsv)}`), h("input.file-input", { attrs: { type: "file", accept: ".csv,text/csv", "aria-label": t($ => $.app.openCsv) },
        on: { change: (event: Event) => { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (file) actions.import(file); input.value = ""; } } })]),
        imagePicker(`↑  ${t($ => $.app.openImage)}`, t($ => $.app.openImage), actions.importImage)]),
    ]),
    h("div.draft-status", { attrs: { role: draft.error ? "alert" : "status", "aria-label": t($ => $.draft.status) } }, [
      h("span", draft.message), draft.action ? button(draft.action === "replace" ? t($ => $.draft.replace) : t($ => $.draft.retry), actions.saveDraft) : h("span"),
    ]),
    h("main.editor-layout", [
      h("section.drawing-panel", { attrs: { "aria-label": t($ => $.app.workspace) } }, [
        h("div.document-bar", [
          h("div.document-name", [h("span.eyebrow", t($ => $.app.studio)), h("input.title-input", { attrs: { "aria-label": t($ => $.app.patternTitle), maxlength: "100" }, props: { value: model.title }, on: { input: (e: Event) => actions.rename(value(e)) } })]),
          h("div.history-controls", [button(`↶ ${t($ => $.app.undo)}`, actions.undo, { disabled: !model.canUndo }), button(`↷ ${t($ => $.app.redo)}`, actions.redo, { disabled: !model.canRedo })]),
        ]),
        h("div.canvas-toolbar", [
          h("div.tools", { attrs: { role: "group", "aria-label": t($ => $.app.tools) } }, ([
            ["pencil", "✎"], ["eraser", "◇"], ["bucket", "▨"],
            ["eyedropper", "⌖"], ["pan", "✥"],
          ] as const).map(([tool, icon]) => button(`${icon} ${t($ => $.tools[tool])}`, () => actions.tool(tool), { "aria-label": tool === "bucket" ? t($ => $.tools.bucketLabel) : tool === "eyedropper" ? t($ => $.tools.eyedropperLabel) : t($ => $.tools[tool]), "aria-pressed": model.tool === tool }, model.tool === tool ? ".active" : ""))),
          h("div.display-controls", [button(t($ => $.app.grid), actions.grid, { "aria-pressed": model.gridVisible }), button(t($ => $.app.codes), actions.codes, { "aria-pressed": model.codesVisible })]),
        ]),
        h("div.canvas-container", [h("canvas.pattern-canvas", { key: "pattern-canvas", hook: canvasHooks, attrs: { tabindex: "0", role: "img", "aria-label": t($ => $.app.canvas), "aria-describedby": "canvas-help" } })]),
        h("div.canvas-status", [
          h("span", t($ => $.app.dimensions, { columns: grid[0].length, rows: grid.length })),
          h("span.counts", { attrs: { "data-testid": "counts" } }, `${t($ => $.beads, { count: model.beads })} · ${t($ => $.colors, { count: model.document.counts.size })}`),
          h("div.zoom-controls", [button("−", () => actions.zoom(1 / 1.25), { "aria-label": t($ => $.app.zoomOut) }), h("output", { attrs: { "aria-label": t($ => $.app.zoomLevel) } }, `${Math.round(model.viewport.zoom / 12 * 100)}%`), button("+", () => actions.zoom(1.25), { "aria-label": t($ => $.app.zoomIn) }), button(t($ => $.app.fit), actions.fit, { "aria-label": t($ => $.app.fitWindow) })]),
        ]),
        h("p.canvas-help", { attrs: { id: "canvas-help" } }, t($ => $.app.canvasHelp)),
        model.error ? h("p.error", { key: "error", attrs: { role: "alert" } }, model.error) : h("span", { key: "error" }),
      ]),
      h("aside.sidebar", [
        h("section.palette-panel", [
          h("div.section-heading", [h("h2", t($ => $.palette.heading)), h("span.tag", "MARD 221")]),
          h("div.selected-color", [h("span.selected-swatch", { attrs: { style: `background:${defaultPalette.colors[model.color]}` } }),
            h("div", [h("strong", model.color), h("span", defaultPalette.colors[model.color])]), h("span.selected-count", t($ => $.beads, { count: model.document.counts.get(model.color) ?? 0 }))]),
          h("input.palette-search", { attrs: { type: "search", placeholder: t($ => $.palette.searchPlaceholder), "aria-label": t($ => $.palette.search) }, props: { value: model.search }, on: { input: (e: Event) => actions.search(value(e)) } }),
          paletteResults(model.paletteSearch, model.color, model.document.counts, actions.color, t),
        ]),
        h("details.export-panel", { attrs: { open: true } }, [h("summary", t($ => $.export.heading)),
          // The export adapter validates only the selected format's settings.
          h("form.export-form", { attrs: { novalidate: true }, on: { submit: (event: Event) => { event.preventDefault(); const data = new FormData(event.target as HTMLFormElement); actions.export({ format: data.get("format") as ExportOptions["format"], scale: Number(data.get("scale")), width: Number(data.get("width")) }); } } }, [
            h("label.field", [h("span", t($ => $.export.format)), h("select", { attrs: { name: "format", "aria-label": t($ => $.export.formatLabel) } }, [h("option", { attrs: { value: "csv" } }, t($ => $.export.csv)), h("option", { attrs: { value: "pixel" } }, t($ => $.export.pixel)), h("option", { attrs: { value: "svg" } }, t($ => $.export.svg)), h("option", { attrs: { value: "chart" } }, t($ => $.export.chart))])]),
            h("div.field-row", [field(t($ => $.export.scale), "scale", "16", { type: "number", min: 1, max: 512 }), field(t($ => $.export.width), "width", "2400", { type: "number", min: 800, max: 10000 })]),
            h("button.primary", { attrs: { type: "submit" } }, `↓  ${t($ => $.export.download)}`),
          ]),
        ]),
        h("details.new-panel", [h("summary", t($ => $.newPattern.heading)), h("form", { attrs: { novalidate: true }, on: { submit: (event: Event) => { event.preventDefault(); const data = new FormData(event.target as HTMLFormElement); actions.create(Number(data.get("columns")), Number(data.get("rows"))); } } }, [
          h("div.field-row", [field(t($ => $.newPattern.columns), "columns", "50", { type: "number", min: 1, max: 256 }), field(t($ => $.newPattern.rows), "rows", "50", { type: "number", min: 1, max: 256 })]),
          h("p.muted", t($ => $.newPattern.warning)), h("button", { attrs: { type: "submit" } }, t($ => $.newPattern.create)),
        ])]),
      ]),
    ]),
    h("footer.app-footer", [h("span", t($ => $.app.footer)), h("span", t($ => $.app.localFiles))]),
    imageView(image, actions, t),
  ]);
}

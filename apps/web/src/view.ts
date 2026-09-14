import { h, type VNode, type Hooks } from "snabbdom";
import { defaultPalette } from "@my-beads/core";
import type { EditorModel, Tool, workflow$ } from "./state.js";
import { imageView, type ImageActions } from "./image-view.js";
import type { ImageSession } from "./image-state.js";
import type { DraftStatus } from "./drafts.js";
import { isLocale, localeNames, type Locale, type Translate } from "./i18n/index.js";
import { paletteResults } from "./palette-view.js";
import { createView, type CreateActions } from "./create-view.js";
import { exportView, type ExportActions } from "./export-view.js";
import type { ExportSettings } from "./export-state.js";

export interface Actions extends ImageActions, CreateActions, ExportActions {
  tool(tool: Tool): void; color(code: string): void; search(value: string): void;
  rename(value: string): void;
  undo(): void; redo(): void; grid(): void; codes(): void; zoom(factor: number): void; fit(): void;
  startNew(): void;
  saveDraft(): void; language(locale: Locale): void;
}
function value(event: Event) { return (event.target as HTMLInputElement).value; }
function button(label: string, action: () => void, attrs: Record<string, string | boolean> = {}, className = "") {
  return h("button", { attrs: { type: "button", class: className.replace(/^\./, ""),
    ...Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, name.startsWith("aria-") ? String(value) : value])) }, on: { click: action } }, label);
}
export function view(model: EditorModel, actions: Actions, canvasHooks: Hooks, image: ImageSession | null, draft: DraftStatus & { message: string }, locale: Locale, t: Translate, flow: ReturnType<typeof workflow$.read>, exports: ExportSettings): VNode {
  const grid = model.document.grid;
  return h("div.workspace", { attrs: { lang: locale } }, [
    h("header.topbar", [
      h("a.brand", { attrs: { href: "#", "aria-label": t($ => $.app.name) }, on: { click: (event: Event) => { event.preventDefault(); actions.startNew(); } } }, [h("span.brand-mark", "▦"), h("span", t($ => $.app.name))]),
      h("span.topbar-note", t($ => $.app.tagline)),
      h("label.language-picker", [h("span", t($ => $.app.language)),
        h("select", { attrs: { "aria-label": t($ => $.app.language) }, props: { value: locale },
          on: { change: (event: Event) => { const selected = value(event); if (isLocale(selected)) actions.language(selected); } } },
        Object.entries(localeNames).map(([code, name]) => h("option", { attrs: { value: code, lang: code }, props: { selected: code === locale } }, name)))]),
      flow.page === "edit" ? h("div.document-actions", [
        button(t($ => $.create.new), actions.startNew),
        button(`↓ ${t($ => $.export.open)}`, actions.openExport, { "aria-label": t($ => $.export.open) }, ".primary"),
      ]) : h("span"),
    ]),
    flow.hasDocument || draft.error ? h("div.draft-status", { key: "draft", attrs: { role: draft.error ? "alert" : "status", "aria-label": t($ => $.draft.status) } }, [
      h("span", draft.message), draft.action && flow.hasDocument ? button(draft.action === "replace" ? t($ => $.draft.replace) : t($ => $.draft.retry), actions.saveDraft) : h("span"),
    ]) : h("span", { key: "draft" }),
    flow.page === "create" ? createView(model, flow, actions, t) : h("main.editor-layout", { key: "edit" }, [
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
        model.error && !exports.open ? h("p.error", { key: "error", attrs: { role: "alert" } }, model.error) : h("span", { key: "error" }),
      ]),
      h("aside.sidebar", [
        h("section.palette-panel", [
          h("div.section-heading", [h("h2", t($ => $.palette.heading)), h("span.tag", "MARD 221")]),
          h("div.selected-color", [h("span.selected-swatch", { attrs: { style: `background:${defaultPalette.colors[model.color]}` } }),
            h("div", [h("strong", model.color), h("span", defaultPalette.colors[model.color])]), h("span.selected-count", t($ => $.beads, { count: model.document.counts.get(model.color) ?? 0 }))]),
          h("input.palette-search", { attrs: { type: "search", placeholder: t($ => $.palette.searchPlaceholder), "aria-label": t($ => $.palette.search) }, props: { value: model.search }, on: { input: (e: Event) => actions.search(value(e)) } }),
          paletteResults(model.paletteSearch, model.color, model.document.counts, actions.color, t),
        ]),
      ]),
    ]),
    h("footer.app-footer", [h("span", t($ => $.app.footer)), h("span", t($ => $.app.localFiles))]),
    imageView(image, actions, t),
    exportView(model, exports, actions, t),
  ]);
}

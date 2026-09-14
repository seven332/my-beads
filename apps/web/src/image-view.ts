import { h, type VNode } from "snabbdom";
import { defaultPalette, type PatternGrid } from "@my-beads/core";
import type { Translate } from "./i18n/index.js";
import type { ImageSession, ImageOptions } from "./image-state.js";

export interface ImageActions {
  importImage(file: File): void; updateImage(options: ImageOptions): void; changeImageSettings(): void;
  overrideImage(source: string, code: string): void; cancelImage(): void; applyImage(): void;
}
export function imagePicker(label: string, name: string, action: (file: File) => void): VNode {
  return h("label.import-button", [h("span", label), h("input.file-input", {
    attrs: { type: "file", accept: "image/png,image/webp", "aria-label": name },
    on: { change: (event: Event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0]; if (file) action(file); input.value = "";
    } },
  })]);
}
function pixels(grid: PatternGrid, mapped: boolean, t: Translate): VNode {
  function paint(node: VNode) {
    const canvas = node.elm as HTMLCanvasElement;
    canvas.width = grid[0].length; canvas.height = grid.length;
    const context = canvas.getContext("2d");
    if (!context) return;
    grid.forEach((row, y) => row.forEach((color, x) => {
      if (color) { context.fillStyle = mapped ? defaultPalette.colors[color] : color; context.fillRect(x, y, 1, 1); }
    }));
  }
  return h("canvas.image-preview", { attrs: { role: "img", "aria-label": mapped ? t($ => $.image.mardPreview) : t($ => $.image.sourcePreview) },
    hook: { insert: paint, update: (_, node) => paint(node) } });
}
export function imageView(session: ImageSession | null, actions: ImageActions, t: Translate): VNode {
  if (!session) return h("span", { key: "image-import" });
  const { options, mapped, sample } = session;
  const number = (label: string, name: string, value: number, max: number) => h("label.field", [h("span", label),
    h("input", { attrs: { name, type: "number", min: name === "alpha" ? 0 : 1, max }, props: { defaultValue: String(value) } })]);
  return h("dialog.image-dialog", {
    key: session.id, attrs: { "aria-labelledby": "image-heading" },
    on: { cancel: (event: Event) => { event.preventDefault(); actions.cancelImage(); } },
    hook: { insert: node => (node.elm as HTMLDialogElement).showModal(), destroy: node => (node.elm as HTMLDialogElement).close() },
  }, [
    h("div.image-heading", [h("div", [h("span.eyebrow", t($ => $.image.heading)), h("h2", { attrs: { id: "image-heading" } }, session.name)]),
      imagePicker(t($ => $.image.chooseAnother), t($ => $.image.replace), actions.importImage)]),
    h("p.muted", t($ => $.image.intro)),
    h("form.image-options", { attrs: { novalidate: true }, on: { input: actions.changeImageSettings, submit: (event: Event) => {
      event.preventDefault(); const data = new FormData(event.target as HTMLFormElement);
      actions.updateImage({ columns: Number(data.get("columns")), rows: Number(data.get("rows")), alpha: Number(data.get("alpha")),
        includeNeutral: !data.has("chroma"), unique: data.has("unique"), series: String(data.get("series") ?? "").split(/[\s,]+/).filter(Boolean) });
    } } }, [
      h("div.image-dimensions", [number(t($ => $.image.columns), "columns", options.columns, 256), number(t($ => $.image.rows), "rows", options.rows, 256), number(t($ => $.image.alpha), "alpha", options.alpha, 255)]),
      h("div.image-matching", [
        h("label.check-field", [h("input", { attrs: { type: "checkbox", name: "chroma" }, props: { defaultChecked: !options.includeNeutral } }), t($ => $.image.chroma)]),
        h("label.check-field", [h("input", { attrs: { type: "checkbox", name: "unique" }, props: { defaultChecked: !!options.unique } }), t($ => $.image.unique)]),
        h("label.field", [h("span", t($ => $.image.series)), h("input", { attrs: { name: "series", placeholder: t($ => $.image.seriesPlaceholder) }, props: { defaultValue: options.series?.join(", ") ?? "" } })]),
        h("button", { attrs: { type: "submit", disabled: !session.pixels } }, t($ => $.image.update)),
      ]),
      h("p.muted", t($ => $.image.settingsHelp)),
    ]),
    session.loading ? h("p", { attrs: { role: "status" } }, t($ => $.image.reading)) : h("span"),
    session.error ? h("p.error", { attrs: { role: "alert" } }, session.error) : h("span"),
    session.settingsDirty && !session.error ? h("p.muted", t($ => $.image.dirty)) : h("span"),
    sample && mapped ? h("div", [
      h("div.image-previews", [h("figure", [pixels(sample.grid, false, t), h("figcaption", t($ => $.image.sourceCaption, { width: session.pixels!.width, height: session.pixels!.height }))]),
        h("figure", [pixels(mapped.grid, true, t), h("figcaption", `MARD 221 · ${t($ => $.app.dimensions, { columns: options.columns, rows: options.rows })} · ${t($ => $.beads, { count: sample.colors.reduce((sum, c) => sum + c.count, 0) })}`)])]),
      h("div.mapping-heading", [h("h3", t($ => $.image.mapping)), h("span.muted", t($ => $.image.sourceColors, { count: mapped.mappings.length }))]),
      h("p.muted", t($ => $.image.mappingHelp)),
      h("datalist", { attrs: { id: "image-mard-codes" } }, mapped.candidates.map(([code, hex]) => h("option", { attrs: { value: code } }, hex))),
      h("div.mapping-list", { attrs: { "aria-label": t($ => $.image.mappings) } }, mapped.mappings.map(mapping =>
        h("div.mapping-row", { key: mapping.source }, [
          h("span.mapping-swatch", { attrs: { style: `background:${mapping.source}` } }),
          h("span", [h("strong", mapping.source), h("small", t($ => $.cells, { count: mapping.count }))]),
          h("span", "→"), h("span.mapping-swatch", { attrs: { style: `background:${mapping.hex}` } }),
          h("label", [h("span.sr-only", t($ => $.image.map, { source: mapping.source })), h("input", {
            attrs: { list: "image-mard-codes", placeholder: t($ => $.image.auto, { code: mapping.code }), autocomplete: "off" },
            props: { value: session.overrides[mapping.source] ?? "" },
            on: { change: (event: Event) => actions.overrideImage(mapping.source, (event.target as HTMLInputElement).value.trim().toUpperCase()) },
          })]),
          mapping.neutralFallback ? h("small", t($ => $.image.neutralFallback)) : h("span"),
        ]))),
    ]) : h("span"),
    h("div.image-footer", [h("button", { attrs: { type: "button" }, on: { click: actions.cancelImage } }, t($ => $.image.cancel)),
      h("button.primary", { attrs: { type: "button", disabled: !mapped || session.loading || session.settingsDirty || !!session.error }, on: { click: actions.applyImage } }, t($ => $.image.apply))]),
  ]);
}

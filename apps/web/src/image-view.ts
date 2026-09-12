import { h, type VNode } from "snabbdom";
import { defaultPalette, type PatternGrid } from "@my-beads/core";
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
function pixels(grid: PatternGrid, mapped: boolean): VNode {
  function paint(node: VNode) {
    const canvas = node.elm as HTMLCanvasElement;
    canvas.width = grid[0].length; canvas.height = grid.length;
    const context = canvas.getContext("2d");
    if (!context) return;
    grid.forEach((row, y) => row.forEach((color, x) => {
      if (color) { context.fillStyle = mapped ? defaultPalette.colors[color] : color; context.fillRect(x, y, 1, 1); }
    }));
  }
  return h("canvas.image-preview", { attrs: { role: "img", "aria-label": mapped ? "MARD preview" : "Sampled source preview" },
    hook: { insert: paint, update: (_, node) => paint(node) } });
}
export function imageView(session: ImageSession | null, actions: ImageActions): VNode {
  if (!session) return h("span", { key: "image-import" });
  const { options, mapped, sample } = session;
  const number = (label: string, name: string, value: number, max: number) => h("label.field", [h("span", label),
    h("input", { attrs: { name, type: "number", min: name === "alpha" ? 0 : 1, max }, props: { defaultValue: String(value) } })]);
  return h("dialog.image-dialog", {
    key: session.id, attrs: { "aria-labelledby": "image-heading" },
    on: { cancel: (event: Event) => { event.preventDefault(); actions.cancelImage(); } },
    hook: { insert: node => (node.elm as HTMLDialogElement).showModal(), destroy: node => (node.elm as HTMLDialogElement).close() },
  }, [
    h("div.image-heading", [h("div", [h("span.eyebrow", "IMPORT PIXEL ART"), h("h2", { attrs: { id: "image-heading" } }, session.name)]),
      imagePicker("Choose another image", "Replace image", actions.importImage)]),
    h("p.muted", "Choose the intended bead grid. Each cell samples one source pixel; transparent cells stay empty. Apply replaces the current pattern."),
    h("form.image-options", { attrs: { novalidate: true }, on: { input: actions.changeImageSettings, submit: (event: Event) => {
      event.preventDefault(); const data = new FormData(event.target as HTMLFormElement);
      actions.updateImage({ columns: Number(data.get("columns")), rows: Number(data.get("rows")), alpha: Number(data.get("alpha")),
        includeNeutral: !data.has("chroma"), unique: data.has("unique"), series: String(data.get("series") ?? "").split(/[\s,]+/).filter(Boolean) });
    } } }, [
      h("div.image-dimensions", [number("Target columns", "columns", options.columns, 256), number("Target rows", "rows", options.rows, 256), number("Alpha threshold", "alpha", options.alpha, 255)]),
      h("div.image-matching", [
        h("label.check-field", [h("input", { attrs: { type: "checkbox", name: "chroma" }, props: { defaultChecked: !options.includeNeutral } }), "Preserve chroma"]),
        h("label.check-field", [h("input", { attrs: { type: "checkbox", name: "unique" }, props: { defaultChecked: !!options.unique } }), "Distinct assignments"]),
        h("label.field", [h("span", "MARD series"), h("input", { attrs: { name: "series", placeholder: "All (or B, H…)" }, props: { defaultValue: options.series?.join(", ") ?? "" } })]),
        h("button", { attrs: { type: "submit", disabled: !session.pixels } }, "Update preview"),
      ]),
      h("p.muted", "Updating settings resets manual overrides. Alpha 0 is always empty; pixels at or above the threshold become beads."),
    ]),
    session.loading ? h("p", { attrs: { role: "status" } }, "Reading image…") : h("span"),
    session.error ? h("p.error", { attrs: { role: "alert" } }, session.error) : h("span"),
    session.settingsDirty && !session.error ? h("p.muted", "Update the preview to apply your changed settings.") : h("span"),
    sample && mapped ? h("div", [
      h("div.image-previews", [h("figure", [pixels(sample.grid, false), h("figcaption", `Sampled source · ${session.pixels!.width} × ${session.pixels!.height} pixels`)]),
        h("figure", [pixels(mapped.grid, true), h("figcaption", `MARD 221 · ${options.columns} × ${options.rows} cells · ${sample.colors.reduce((sum, c) => sum + c.count, 0)} beads`)])]),
      h("div.mapping-heading", [h("h3", "Color mapping"), h("span.muted", `${mapped.mappings.length} source colors`)]),
      h("p.muted", "Choose a MARD code for each source color. Clear an override to use automatic matching."),
      h("datalist", { attrs: { id: "image-mard-codes" } }, mapped.candidates.map(([code, hex]) => h("option", { attrs: { value: code } }, hex))),
      h("div.mapping-list", { attrs: { "aria-label": "Source color mappings" } }, mapped.mappings.map(mapping =>
        h("div.mapping-row", { key: mapping.source }, [
          h("span.mapping-swatch", { attrs: { style: `background:${mapping.source}` } }),
          h("span", [h("strong", mapping.source), h("small", `${mapping.count} cells`)]),
          h("span", "→"), h("span.mapping-swatch", { attrs: { style: `background:${mapping.hex}` } }),
          h("label", [h("span.sr-only", `Map ${mapping.source}`), h("input", {
            attrs: { list: "image-mard-codes", placeholder: `Auto · ${mapping.code}`, autocomplete: "off" },
            props: { value: session.overrides[mapping.source] ?? "" },
            on: { change: (event: Event) => actions.overrideImage(mapping.source, (event.target as HTMLInputElement).value.trim().toUpperCase()) },
          })]),
          mapping.neutralFallback ? h("small", "Neutral fallback") : h("span"),
        ]))),
    ]) : h("span"),
    h("div.image-footer", [h("button", { attrs: { type: "button" }, on: { click: actions.cancelImage } }, "Cancel"),
      h("button.primary", { attrs: { type: "button", disabled: !mapped || session.loading || session.settingsDirty || !!session.error }, on: { click: actions.applyImage } }, "Apply image")]),
  ]);
}

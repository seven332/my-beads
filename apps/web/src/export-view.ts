import { h, type VNode } from "snabbdom";
import type { EditorModel } from "./state.js";
import type { ExportFormat, ExportOptions } from "./exports.js";
import type { ExportSettings } from "./export-state.js";
import type { Translate } from "./i18n/index.js";
import { Download, X } from "@lucide/icons";
import { icon } from "./icon.js";

export interface ExportActions {
  openExport(): void; closeExport(): void;
  exportFormat(format: ExportFormat): void;
  exportSize(field: "scale" | "width", value: string): void;
  export(options: ExportOptions): void;
}
export function exportView(model: EditorModel, settings: ExportSettings, actions: ExportActions, t: Translate): VNode {
  if (!settings.open) return h("span", { key: "export-dialog" });
  const chart = settings.format === "svg" || settings.format === "chart";
  const size = (field: "scale" | "width") => h("label.field", { key: field }, [h("span", t($ => $.export[field])), h("input", {
    attrs: { name: field, type: "number", min: field === "scale" ? 1 : 800, max: field === "scale" ? 512 : 10000 },
    props: { value: settings[field] }, on: { input: (event: Event) => actions.exportSize(field, (event.target as HTMLInputElement).value) },
  })]);
  return h("dialog.export-dialog", {
    key: "export-dialog", attrs: { "aria-labelledby": "export-heading" },
    on: { cancel: (event: Event) => { event.preventDefault(); actions.closeExport(); } },
    hook: { insert: node => (node.elm as HTMLDialogElement).showModal(), destroy: node => (node.elm as HTMLDialogElement).close() },
  }, [
    h("div.export-heading", [h("h2", { attrs: { id: "export-heading" } }, t($ => $.export.heading)),
      h("button.icon-button", { attrs: { type: "button", "aria-label": t($ => $.export.close) }, on: { click: actions.closeExport } }, [icon(X)])]),
    h("div.export-document", [h("strong", model.title), h("p", `${t($ => $.app.dimensions, { columns: model.document.grid[0].length, rows: model.document.grid.length })} · ${t($ => $.beads, { count: model.beads })} · ${t($ => $.colors, { count: model.document.counts.size })}`)]),
    h("form.export-form", { attrs: { novalidate: true }, on: { submit: (event: Event) => {
      event.preventDefault(); actions.export({ format: settings.format, scale: Number(settings.scale), width: Number(settings.width) });
    } } }, [
      h("fieldset", { attrs: { disabled: settings.pending } }, [
        h("label.field", [h("span", t($ => $.export.format)), h("select", {
          attrs: { name: "format", "aria-label": t($ => $.export.formatLabel) }, props: { value: settings.format },
          on: { change: (event: Event) => actions.exportFormat((event.target as HTMLSelectElement).value as ExportFormat) },
        }, (["csv", "pixel", "svg", "chart"] as const).map(format => h("option", { attrs: { value: format }, props: { selected: settings.format === format } }, t($ => $.export[format]))))]),
        h("p.export-description", t($ => $.export.descriptions[settings.format])),
        settings.format === "pixel" ? size("scale") : chart ? size("width") : h("span", { key: "no-size" }),
        chart ? h("p.muted", t($ => $.export.english)) : h("span"),
        model.error ? h("p.error", { attrs: { role: "alert" } }, model.error) : h("span"),
        h("button.primary.with-icon", { attrs: { type: "submit" } }, settings.pending ? t($ => $.export.preparing) : [icon(Download), h("span", t($ => $.export.download))]),
      ]),
    ]),
  ]);
}

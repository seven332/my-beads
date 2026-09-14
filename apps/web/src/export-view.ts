import { html, nothing } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { keyed } from "lit-html/directives/keyed.js";
import { ref, type Ref } from "lit-html/directives/ref.js";
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
export function exportView(model: EditorModel, settings: ExportSettings, actions: ExportActions, t: Translate, dialog: Ref<HTMLDialogElement>) {
  if (!settings.open) return nothing;
  const chart = settings.format === "svg" || settings.format === "chart";
  const size = (field: "scale" | "width") => keyed(field, html`<label class="field"><span>${t($ => $.export[field])}</span>
    <input name=${field} type="number" min=${field === "scale" ? 1 : 800} max=${field === "scale" ? 512 : 10000}
      .value=${live(settings[field])} @input=${(event: Event) => actions.exportSize(field, (event.target as HTMLInputElement).value)}>
  </label>`);
  return html`<dialog class="export-dialog" ${ref(dialog)} aria-labelledby="export-heading"
    @cancel=${(event: Event) => { event.preventDefault(); actions.closeExport(); }}>
    <div class="export-heading"><h2 id="export-heading">${t($ => $.export.heading)}</h2>
      <button class="icon-button" type="button" aria-label=${t($ => $.export.close)} @click=${actions.closeExport}>${icon(X)}</button>
    </div>
    <div class="export-document"><strong>${model.title}</strong><p>${t($ => $.app.dimensions, { columns: model.document.grid[0].length, rows: model.document.grid.length })} · ${t($ => $.beads, { count: model.beads })} · ${t($ => $.colors, { count: model.document.counts.size })}</p></div>
    <form class="export-form" novalidate @submit=${(event: Event) => {
      event.preventDefault(); actions.export({ format: settings.format, scale: Number(settings.scale), width: Number(settings.width) });
    }}>
      <fieldset ?disabled=${settings.pending}>
        <label class="field"><span>${t($ => $.export.format)}</span>
          <select name="format" aria-label=${t($ => $.export.formatLabel)} .value=${live(settings.format)}
            @change=${(event: Event) => actions.exportFormat((event.target as HTMLSelectElement).value as ExportFormat)}>
            ${(["csv", "pixel", "svg", "chart"] as const).map(format => html`<option value=${format} .selected=${settings.format === format}>${t($ => $.export[format])}</option>`)}
          </select>
        </label>
        <p class="export-description">${t($ => $.export.descriptions[settings.format])}</p>
        ${settings.format === "pixel" ? size("scale") : chart ? size("width") : nothing}
        ${chart ? html`<p class="muted">${t($ => $.export.english)}</p>` : nothing}
        ${model.error ? html`<p class="error" role="alert">${model.error}</p>` : nothing}
        <button class="primary with-icon" type="submit">${settings.pending ? t($ => $.export.preparing) : html`${icon(Download)}<span>${t($ => $.export.download)}</span>`}</button>
      </fieldset>
    </form>
  </dialog>`;
}

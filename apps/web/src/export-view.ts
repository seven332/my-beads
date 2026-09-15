import { html, nothing } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { keyed } from "lit-html/directives/keyed.js";
import type { Ref } from "lit-html/directives/ref.js";
import type { EditorModel } from "./state.js";
import type { ExportFormat, ExportOptions } from "./exports.js";
import type { ExportSettings } from "./export-state.js";
import type { Translate } from "./i18n/index.js";
import { Download, X } from "@lucide/icons";
import { icon } from "./icon.js";
import { button, iconButton } from "./ui/button.js";
import { field as formField } from "./ui/field.js";
import { modal } from "./ui/dialog.js";

export interface ExportActions {
  openExport(): void;
  closeExport(): void;
  exportFormat(format: ExportFormat): void;
  exportSize(field: "scale" | "width", value: string): void;
  export(options: ExportOptions): void;
}
export function exportView(
  model: EditorModel,
  settings: ExportSettings,
  actions: ExportActions,
  t: Translate,
  dialog: Ref<HTMLDialogElement>,
) {
  if (!settings.open) return nothing;
  const chart = settings.format === "svg" || settings.format === "chart";
  const size = (field: "scale" | "width") =>
    keyed(
      field,
      formField(
        t(($) => $.export[field]),
        html`<input
          class="w-full text-ui"
          name=${field}
          type="number"
          min=${field === "scale" ? 1 : 800}
          max=${field === "scale" ? 512 : 10000}
          .value=${live(settings[field])}
          @input=${(event: Event) =>
            actions.exportSize(field, (event.target as HTMLInputElement).value)}
        />`,
      ),
    );
  return modal(
    {
      ref: dialog,
      labelledBy: "export-heading",
      className:
        "export-dialog max-h-[calc(100dvh_-_32px)] w-[min(520px,calc(100vw_-_32px))] p-7 narrow:p-5",
      onCancel: actions.closeExport,
    },
    html`<div class="export-heading flex items-center justify-between gap-4">
        <h2 class="text-[23px]" id="export-heading">${t(($) => $.export.heading)}</h2>
        ${iconButton(
          t(($) => $.export.close),
          X,
          { className: "icon-button", onClick: actions.closeExport },
        )}
      </div>
      <div class="my-6 border-0 border-b border-solid border-border pb-5 [overflow-wrap:anywhere]">
        <strong>${model.title}</strong>
        <p class="mb-0 text-ui leading-[1.8] text-secondary">
          ${t(($) => $.app.dimensions, {
            columns: model.document.grid[0].length,
            rows: model.document.grid.length,
          })}
          · ${t(($) => $.beads, { count: model.beads })} ·
          ${t(($) => $.colors, { count: model.document.counts.size })}
        </p>
      </div>
      <form
        class="export-form"
        novalidate
        @submit=${(event: Event) => {
          event.preventDefault();
          actions.export({
            format: settings.format,
            scale: Number(settings.scale),
            width: Number(settings.width),
          });
        }}
      >
        <fieldset class="m-0 min-w-0 border-0 p-0" ?disabled=${settings.pending}>
          ${formField(
            t(($) => $.export.format),
            html`<select
              class="w-full text-ui"
              name="format"
              aria-label=${t(($) => $.export.formatLabel)}
              .value=${live(settings.format)}
              @change=${(event: Event) =>
                actions.exportFormat((event.target as HTMLSelectElement).value as ExportFormat)}
            >
              ${(["csv", "pixel", "svg", "chart"] as const).map(
                (format) =>
                  html`<option value=${format} .selected=${settings.format === format}>
                    ${t(($) => $.export[format])}
                  </option>`,
              )}
            </select>`,
          )}
          <p class="mt-0 mb-5 text-body leading-[1.8] text-secondary">
            ${t(($) => $.export.descriptions[settings.format])}
          </p>
          ${settings.format === "pixel" ? size("scale") : chart ? size("width") : nothing}
          ${chart ? html`<p class="muted">${t(($) => $.export.english)}</p>` : nothing}
          ${model.error ? html`<p class="error" role="alert">${model.error}</p>` : nothing}
          ${button(
            settings.pending
              ? t(($) => $.export.preparing)
              : html`${icon(Download)}<span>${t(($) => $.export.download)}</span>`,
            { variant: "primary", className: "with-icon mt-3", type: "submit" },
          )}
        </fieldset>
      </form> `,
  );
}

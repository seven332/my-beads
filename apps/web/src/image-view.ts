import { html, nothing } from "lit-html";
import { keyed } from "lit-html/directives/keyed.js";
import { live } from "lit-html/directives/live.js";
import { ref } from "lit-html/directives/ref.js";
import { repeat } from "lit-html/directives/repeat.js";
import { defaultPalette } from "@my-beads/core";
import type { Translate } from "./i18n/index.js";
import type { ImageSession, ImageOptions } from "./image-state.js";
import type { ViewRefs } from "./view-lifecycle.js";
import { button } from "./ui/button.js";
import { field } from "./ui/field.js";
import { modal } from "./ui/dialog.js";

export interface ImageActions {
  importImage(file: File): void;
  changeImageSettings(options: ImageOptions, immediate: boolean): void;
  overrideImage(source: string, code: string): void;
  cancelImage(): void;
  applyImage(): void;
}
const imageColors = Object.entries(defaultPalette.colors);
export function imagePicker(label: string, name: string, action: (file: File) => void) {
  return html`<label class="import-button"
    ><span>${label}</span>
    <input
      class="file-input"
      type="file"
      accept="image/png,image/webp"
      aria-label=${name}
      @change=${(event: Event) => {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file) action(file);
        input.value = "";
      }}
    />
  </label>`;
}
export function imageView(
  session: ImageSession | null,
  actions: ImageActions,
  t: Translate,
  refs: ViewRefs,
) {
  if (!session) return nothing;
  const { options, preview, sample } = session;
  const previousMappings = new Map(
    preview?.mapped.mappings.map((mapping) => [mapping.source, mapping]),
  );
  const changeSettings = (form: HTMLFormElement, immediate: boolean) => {
    const data = new FormData(form);
    const value = (name: string) => {
      const raw = data.get(name);
      return raw === null || raw === "" ? NaN : Number(raw);
    };
    actions.changeImageSettings(
      {
        columns: value("columns"),
        rows: value("rows"),
        alpha: value("alpha"),
        includeNeutral: !data.has("chroma"),
        unique: data.has("unique"),
      },
      immediate,
    );
  };
  const number = (label: string, name: string, value: number, max: number) =>
    field(
      label,
      html`<input
        class="w-full text-ui"
        name=${name}
        type="number"
        min=${name === "alpha" ? 0 : 1}
        max=${max}
        .defaultValue=${String(value)}
      />`,
    );
  return keyed(
    session.id,
    modal(
      {
        ref: refs.imageDialog,
        labelledBy: "image-heading",
        className:
          "image-dialog max-h-[calc(100vh_-_40px)] w-[min(900px,calc(100vw_-_28px))] p-6 mobile:p-4",
        onCancel: actions.cancelImage,
      },
      html`<div
          class="image-heading flex items-center justify-between gap-4 mobile:flex-col mobile:items-start"
        >
          <div>
            <span class="eyebrow">${t(($) => $.image.heading)}</span>
            <h2 class="text-[22px] [overflow-wrap:anywhere]" id="image-heading">${session.name}</h2>
          </div>
          ${imagePicker(
            t(($) => $.image.chooseAnother),
            t(($) => $.image.replace),
            actions.importImage,
          )}
        </div>
        <p class="muted">${t(($) => $.image.intro)}</p>
        <form
          class="image-options"
          novalidate
          @input=${(event: Event) =>
            changeSettings(
              event.currentTarget as HTMLFormElement,
              (event.target as HTMLInputElement).type === "checkbox",
            )}
          @keydown=${(event: KeyboardEvent) => {
            if (event.key === "Enter" && !event.isComposing) {
              event.preventDefault();
              changeSettings(event.currentTarget as HTMLFormElement, true);
            }
          }}
          @submit=${(event: Event) => {
            event.preventDefault();
            changeSettings(event.currentTarget as HTMLFormElement, true);
          }}
        >
          <div class="grid grid-cols-3 gap-4 mobile:gap-2">
            ${number(
              t(($) => $.image.columns),
              "columns",
              options.columns,
              256,
            )}${number(
              t(($) => $.image.rows),
              "rows",
              options.rows,
              256,
            )}${number(
              t(($) => $.image.alpha),
              "alpha",
              options.alpha,
              255,
            )}
          </div>
          <div class="flex flex-wrap items-center justify-between gap-4 text-ui">
            <label class="flex items-center gap-[7px]"
              ><input
                type="checkbox"
                name="chroma"
                .defaultChecked=${!options.includeNeutral}
              />${t(($) => $.image.chroma)}</label
            >
            <label class="flex items-center gap-[7px]"
              ><input type="checkbox" name="unique" .defaultChecked=${!!options.unique} />${t(
                ($) => $.image.unique,
              )}</label
            >
          </div>
          <p class="muted">${t(($) => $.image.settingsHelp)}</p>
        </form>
        ${session.loading ? html`<p role="status">${t(($) => $.image.reading)}</p>` : nothing}
        ${session.error ? html`<p class="error" role="alert">${session.error}</p>` : nothing}
        ${session.settingsDirty && !session.loading
          ? html`<p class="muted" role="status">${t(($) => $.image.updating)}</p>`
          : nothing}
        ${preview
          ? html`<div aria-busy=${String(session.settingsDirty)}>
              ${session.settingsDirty || session.error
                ? html`<p class="muted">${t(($) => $.image.stale)}</p>`
                : nothing}
              <div class="image-previews my-5 grid grid-cols-2 gap-5 mobile:gap-2.5">
                <figure class="m-0 min-w-0 text-center">
                  <canvas
                    class="image-preview"
                    ${ref(refs.sourcePreview)}
                    role="img"
                    aria-label=${t(($) => $.image.sourcePreview)}
                  ></canvas>
                  <figcaption class="mt-[9px] text-caption">
                    ${t(($) => $.image.sourceCaption, {
                      width: session.pixels!.width,
                      height: session.pixels!.height,
                    })}
                  </figcaption>
                </figure>
                <figure class="m-0 min-w-0 text-center">
                  <canvas
                    class="image-preview"
                    ${ref(refs.mappedPreview)}
                    role="img"
                    aria-label=${t(($) => $.image.mardPreview)}
                  ></canvas>
                  <figcaption class="mt-[9px] text-caption">
                    MARD 221 ·
                    ${t(($) => $.app.dimensions, {
                      columns: preview.mapped.grid[0].length,
                      rows: preview.mapped.grid.length,
                    })}
                    ·
                    ${t(($) => $.beads, {
                      count: preview.sample.colors.reduce((sum, c) => sum + c.count, 0),
                    })}
                  </figcaption>
                </figure>
              </div>
            </div>`
          : nothing}
        ${sample
          ? html`<div>
              <div class="flex items-center justify-between gap-4">
                <h3 class="text-[15px]">${t(($) => $.image.mapping)}</h3>
                <span class="muted"
                  >${t(($) => $.image.sourceColors, { count: sample.colors.length })}</span
                >
              </div>
              <p class="muted">${t(($) => $.image.mappingHelp)}</p>
              <datalist id="image-mard-codes">
                ${imageColors.map(([code, hex]) => html`<option value=${code}>${hex}</option>`)}
              </datalist>
              <div
                class="mapping-list max-h-[260px] overflow-auto rounded-lg border border-solid border-border"
                aria-label=${t(($) => $.image.mappings)}
              >
                ${repeat(
                  [...sample.colors].sort((a, b) => a.hex.localeCompare(b.hex)),
                  (color) => color.hex,
                  ({ hex: source, count }) => {
                    const mapping = previousMappings.get(source);
                    const color = defaultPalette.colors[session.overrides[source]] ?? mapping?.hex;
                    return html`<div class="mapping-row">
                      <span class="mapping-swatch" style=${`background:${source}`}></span>
                      <span
                        ><strong>${source}</strong
                        ><small>${t(($) => $.cells, { count })}</small></span
                      >
                      <span>→</span
                      ><span
                        class="mapping-swatch"
                        style=${`background:${color ?? "transparent"}`}
                      ></span>
                      <label
                        ><span class="sr-only">${t(($) => $.image.map, { source })}</span>
                        <input
                          list="image-mard-codes"
                          placeholder=${mapping
                            ? t(($) => $.image.auto, { code: mapping.code })
                            : t(($) => $.image.automatic)}
                          autocomplete="off"
                          .value=${live(session.overrides[source] ?? "")}
                          @input=${(event: Event) =>
                            actions.overrideImage(
                              source,
                              (event.target as HTMLInputElement).value.trim().toUpperCase(),
                            )}
                        />
                      </label>
                      ${mapping?.neutralFallback && !session.settingsDirty && !session.error
                        ? html`<small>${t(($) => $.image.neutralFallback)}</small>`
                        : nothing}
                    </div>`;
                  },
                )}
              </div>
            </div>`
          : nothing}
        <div class="image-footer">
          ${button(
            t(($) => $.image.cancel),
            { onClick: actions.cancelImage },
          )}
          ${button(
            t(($) => $.image.apply),
            {
              variant: "primary",
              disabled: !preview || session.loading || session.settingsDirty || !!session.error,
              onClick: actions.applyImage,
            },
          )}
        </div> `,
    ),
  );
}

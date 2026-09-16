import { html, nothing } from "lit-html";
import { keyed } from "lit-html/directives/keyed.js";
import { live } from "lit-html/directives/live.js";
import { ref } from "lit-html/directives/ref.js";
import { repeat } from "lit-html/directives/repeat.js";
import { defaultPalette, linkedImageSize } from "@my-beads/core";
import type { Translate } from "./i18n/index.js";
import type { ImageSession, ImageOptions } from "./image-state.js";
import type { ViewRefs } from "./view-lifecycle.js";
import { button } from "./ui/button.js";
import { field } from "./ui/field.js";
import { modal } from "./ui/dialog.js";
import { select } from "./ui/select.js";

export interface ImageActions {
  importImage(file: File): void;
  changeImageSettings(options: ImageOptions, immediate: boolean): void;
  overrideImage(source: string, code: string): void;
  filterImageMappings(query: string): void;
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
      accept="image/png,image/webp,image/jpeg"
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
  const usedColors = new Map<string, number>();
  for (const mapping of preview?.mapped.mappings ?? [])
    usedColors.set(mapping.code, (usedColors.get(mapping.code) ?? 0) + mapping.count);
  const filtered = (sample?.colors ?? []).filter((color) =>
    color.hex.includes(session.mappingQuery.trim().toUpperCase()),
  );
  const changeSettings = (form: HTMLFormElement, immediate: boolean, axis?: string) => {
    const data = new FormData(form);
    const value = (name: string) => {
      const raw = data.get(name);
      return raw === null || raw === "" ? NaN : Number(raw);
    };
    const next = {
      ...options,
      columns: value("columns"),
      rows: value("rows"),
      alpha: value("alpha"),
      maxColors: value("maxColors"),
      lockAspect: data.has("lockAspect"),
      includeNeutral: !data.has("chroma"),
      unique: data.has("unique"),
    };
    if (
      next.lockAspect &&
      session.pixels &&
      (axis === "columns" || axis === "rows" || axis === "lockAspect")
    ) {
      const dimension = axis === "rows" ? "rows" : "columns";
      Object.assign(
        next,
        linkedImageSize(session.pixels.width, session.pixels.height, dimension, next[dimension]),
      );
    }
    actions.changeImageSettings(next, immediate);
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
        .value=${live(Number.isNaN(value) ? "" : String(value))}
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
        <div class="mb-4">
          ${select(
            t(($) => $.image.mode),
            options.mode,
            [
              { value: "image", label: t(($) => $.image.ordinary) },
              { value: "pixel", label: t(($) => $.image.preservePixels) },
            ],
            (mode) =>
              actions.changeImageSettings(
                { ...options, mode, maxColors: mode === "pixel" ? 221 : 24 },
                true,
              ),
          )}
        </div>
        <form
          class="image-options"
          novalidate
          @input=${(event: Event) =>
            changeSettings(
              event.currentTarget as HTMLFormElement,
              (event.target as HTMLInputElement).type === "checkbox",
              (event.target as HTMLInputElement).name,
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
              t(($) => $.image.maximumColors),
              "maxColors",
              options.maxColors,
              221,
            )}
          </div>
          <label class="flex items-center gap-[7px] text-ui"
            ><input type="checkbox" name="lockAspect" .checked=${live(options.lockAspect)} />${t(
              ($) => $.image.lockAspect,
            )}</label
          >
          <p class="muted">${t(($) => $.image.budgetHelp)}</p>
          <details class="text-ui" ?open=${options.mode === "pixel"}>
            <summary>${t(($) => $.image.advanced)}</summary>
            ${number(
              t(($) => $.image.alpha),
              "alpha",
              options.alpha,
              255,
            )}
            <div class="flex flex-wrap items-center justify-between gap-4 text-ui">
              <label class="flex items-center gap-[7px]"
                ><input
                  type="checkbox"
                  name="chroma"
                  .checked=${live(!options.includeNeutral)}
                />${t(($) => $.image.chroma)}</label
              >
              ${options.mode === "pixel"
                ? html`<label class="flex items-center gap-[7px]"
                    ><input type="checkbox" name="unique" .checked=${live(!!options.unique)} />${t(
                      ($) => $.image.unique,
                    )}</label
                  >`
                : nothing}
            </div>
            <p class="muted">${t(($) => $.image.settingsHelp)}</p>
          </details>
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
                    MARD 221 · ${t(($) => $.colors, { count: usedColors.size })} ·
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
        ${preview && options.mode === "image"
          ? html`<div
              class="flex max-h-[160px] flex-wrap gap-2 overflow-auto"
              aria-label=${t(($) => $.image.usedColors)}
            >
              ${[...usedColors]
                .sort((a, b) => b[1] - a[1])
                .map(
                  ([code, count]) =>
                    html`<span
                      class="flex items-center gap-2 rounded-lg border border-solid border-border px-3 py-2 text-ui"
                      ><span
                        class="mapping-swatch"
                        style=${`background:${defaultPalette.colors[code]}`}
                      ></span
                      ><span>${code} · ${t(($) => $.beads, { count })}</span></span
                    >`,
                )}
            </div>`
          : nothing}
        ${sample && options.mode === "pixel"
          ? html`<div>
              <div class="flex items-center justify-between gap-4">
                <h3 class="text-[15px]">${t(($) => $.image.mapping)}</h3>
                <span class="muted"
                  >${t(($) => $.image.sourceColors, { count: sample.colors.length })}</span
                >
              </div>
              <p class="muted">${t(($) => $.image.mappingHelp)}</p>
              ${field(
                t(($) => $.image.findSource),
                html`<input
                  type="search"
                  .value=${live(session.mappingQuery)}
                  @input=${(event: Event) =>
                    actions.filterImageMappings((event.target as HTMLInputElement).value)}
                />`,
              )}
              <p class="muted">
                ${t(($) => $.image.mappingLimit, {
                  shown: Math.min(100, filtered.length),
                  total: filtered.length,
                })}
              </p>
              <datalist id="image-mard-codes">
                ${imageColors.map(([code, hex]) => html`<option value=${code}>${hex}</option>`)}
              </datalist>
              <div
                class="mapping-list max-h-[260px] overflow-auto rounded-lg border border-solid border-border"
                aria-label=${t(($) => $.image.mappings)}
              >
                ${repeat(
                  [...filtered].sort((a, b) => a.hex.localeCompare(b.hex)).slice(0, 100),
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

import { html, nothing } from "lit-html";
import { keyed } from "lit-html/directives/keyed.js";
import { live } from "lit-html/directives/live.js";
import { ref } from "lit-html/directives/ref.js";
import { repeat } from "lit-html/directives/repeat.js";
import type { Translate } from "./i18n/index.js";
import type { ImageSession, ImageOptions } from "./image-state.js";
import type { ViewRefs } from "./view-lifecycle.js";

export interface ImageActions {
  importImage(file: File): void; updateImage(options: ImageOptions): void; changeImageSettings(): void;
  overrideImage(source: string, code: string): void; cancelImage(): void; applyImage(): void;
}
export function imagePicker(label: string, name: string, action: (file: File) => void) {
  return html`<label class="import-button"><span>${label}</span>
    <input class="file-input" type="file" accept="image/png,image/webp" aria-label=${name} @change=${(event: Event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0]; if (file) action(file); input.value = "";
    }}>
  </label>`;
}
export function imageView(session: ImageSession | null, actions: ImageActions, t: Translate, refs: ViewRefs) {
  if (!session) return nothing;
  const { options, mapped, sample } = session;
  const number = (label: string, name: string, value: number, max: number) => html`<label class="field"><span>${label}</span>
    <input name=${name} type="number" min=${name === "alpha" ? 0 : 1} max=${max} .defaultValue=${String(value)}>
  </label>`;
  return keyed(session.id, html`<dialog class="image-dialog" ${ref(refs.imageDialog)} aria-labelledby="image-heading"
    @cancel=${(event: Event) => { event.preventDefault(); actions.cancelImage(); }}>
    <div class="image-heading"><div><span class="eyebrow">${t($ => $.image.heading)}</span><h2 id="image-heading">${session.name}</h2></div>
      ${imagePicker(t($ => $.image.chooseAnother), t($ => $.image.replace), actions.importImage)}
    </div>
    <p class="muted">${t($ => $.image.intro)}</p>
    <form class="image-options" novalidate @input=${actions.changeImageSettings} @submit=${(event: Event) => {
      event.preventDefault(); const data = new FormData(event.target as HTMLFormElement);
      actions.updateImage({ columns: Number(data.get("columns")), rows: Number(data.get("rows")), alpha: Number(data.get("alpha")),
        includeNeutral: !data.has("chroma"), unique: data.has("unique"), series: String(data.get("series") ?? "").split(/[\s,]+/).filter(Boolean) });
    }}>
      <div class="image-dimensions">${number(t($ => $.image.columns), "columns", options.columns, 256)}${number(t($ => $.image.rows), "rows", options.rows, 256)}${number(t($ => $.image.alpha), "alpha", options.alpha, 255)}</div>
      <div class="image-matching">
        <label class="check-field"><input type="checkbox" name="chroma" .defaultChecked=${!options.includeNeutral}>${t($ => $.image.chroma)}</label>
        <label class="check-field"><input type="checkbox" name="unique" .defaultChecked=${!!options.unique}>${t($ => $.image.unique)}</label>
        <label class="field"><span>${t($ => $.image.series)}</span><input name="series" placeholder=${t($ => $.image.seriesPlaceholder)} .defaultValue=${options.series?.join(", ") ?? ""}></label>
        <button type="submit" ?disabled=${!session.pixels}>${t($ => $.image.update)}</button>
      </div>
      <p class="muted">${t($ => $.image.settingsHelp)}</p>
    </form>
    ${session.loading ? html`<p role="status">${t($ => $.image.reading)}</p>` : nothing}
    ${session.error ? html`<p class="error" role="alert">${session.error}</p>` : nothing}
    ${session.settingsDirty && !session.error ? html`<p class="muted">${t($ => $.image.dirty)}</p>` : nothing}
    ${sample && mapped ? html`<div>
      <div class="image-previews">
        <figure><canvas class="image-preview" ${ref(refs.sourcePreview)} role="img" aria-label=${t($ => $.image.sourcePreview)}></canvas><figcaption>${t($ => $.image.sourceCaption, { width: session.pixels!.width, height: session.pixels!.height })}</figcaption></figure>
        <figure><canvas class="image-preview" ${ref(refs.mappedPreview)} role="img" aria-label=${t($ => $.image.mardPreview)}></canvas><figcaption>MARD 221 · ${t($ => $.app.dimensions, { columns: options.columns, rows: options.rows })} · ${t($ => $.beads, { count: sample.colors.reduce((sum, c) => sum + c.count, 0) })}</figcaption></figure>
      </div>
      <div class="mapping-heading"><h3>${t($ => $.image.mapping)}</h3><span class="muted">${t($ => $.image.sourceColors, { count: mapped.mappings.length })}</span></div>
      <p class="muted">${t($ => $.image.mappingHelp)}</p>
      <datalist id="image-mard-codes">${mapped.candidates.map(([code, hex]) => html`<option value=${code}>${hex}</option>`)}</datalist>
      <div class="mapping-list" aria-label=${t($ => $.image.mappings)}>
        ${repeat(mapped.mappings, mapping => mapping.source, mapping => html`<div class="mapping-row">
          <span class="mapping-swatch" style=${`background:${mapping.source}`}></span>
          <span><strong>${mapping.source}</strong><small>${t($ => $.cells, { count: mapping.count })}</small></span>
          <span>→</span><span class="mapping-swatch" style=${`background:${mapping.hex}`}></span>
          <label><span class="sr-only">${t($ => $.image.map, { source: mapping.source })}</span>
            <input list="image-mard-codes" placeholder=${t($ => $.image.auto, { code: mapping.code })} autocomplete="off"
              .value=${live(session.overrides[mapping.source] ?? "")}
              @change=${(event: Event) => actions.overrideImage(mapping.source, (event.target as HTMLInputElement).value.trim().toUpperCase())}>
          </label>
          ${mapping.neutralFallback ? html`<small>${t($ => $.image.neutralFallback)}</small>` : nothing}
        </div>`)}
      </div>
    </div>` : nothing}
    <div class="image-footer"><button type="button" @click=${actions.cancelImage}>${t($ => $.image.cancel)}</button>
      <button class="primary" type="button" ?disabled=${!mapped || session.loading || session.settingsDirty || !!session.error} @click=${actions.applyImage}>${t($ => $.image.apply)}</button>
    </div>
  </dialog>`);
}

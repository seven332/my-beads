import { html, nothing } from "lit-html";
import type { EditorModel, workflow$ } from "./state.js";
import type { Translate } from "./i18n/index.js";
import { imagePicker } from "./image-view.js";
import { FileSpreadsheet, Grid3x3, ImagePlus } from "@lucide/icons";
import { icon } from "./icon.js";

export interface CreateActions {
  create(width: number, height: number): void;
  import(file: File): void;
  importImage(file: File): void;
  resume(): void;
}
export function createView(model: EditorModel, flow: ReturnType<typeof workflow$.read>, actions: CreateActions, t: Translate) {
  function error(source: typeof flow.errorSource) {
    return model.error && flow.errorSource === source ? html`<p class="error" role="alert">${model.error}</p>` : nothing;
  }
  function dimension(name: "columns" | "rows") {
    return html`<label class="field"><span>${t($ => $.newPattern[name])}</span>
      <input type="number" name=${name} min="1" max="256" required .defaultValue=${"50"}>
    </label>`;
  }
  return html`<main class="create-page" aria-labelledby="create-heading">
    <div class="create-intro"><span class="eyebrow">${t($ => $.app.studio)}</span>
      <h1 id="create-heading" tabindex="-1">${t($ => $.create.heading)}</h1><p>${t($ => $.create.intro)}</p>
    </div>
    ${flow.hasDocument ? html`<div class="resume-pattern">
      <div><span class="eyebrow">${t($ => $.create.current)}</span><strong>${model.title}</strong>
        <p data-testid="counts">${t($ => $.beads, { count: model.beads })} · ${t($ => $.colors, { count: model.document.counts.size })}</p>
        <p>${t($ => $.create.keepCurrent)}</p></div>
      <button type="button" @click=${actions.resume}>${t($ => $.create.resume)}</button>
    </div>` : nothing}
    <div class="creation-options">
      <section class="creation-card blank-card" aria-labelledby="blank-heading">
        <div class="creation-icon">${icon(Grid3x3)}</div><h2 id="blank-heading">${t($ => $.create.blank)}</h2>
        <p class="card-description">${t($ => $.create.blankDescription)}</p>
        <form class="blank-form" novalidate @submit=${(event: Event) => {
          event.preventDefault(); const data = new FormData(event.target as HTMLFormElement);
          actions.create(Number(data.get("columns")), Number(data.get("rows")));
        }}>
          <div class="field-row">${dimension("columns")}${dimension("rows")}</div>
          <p class="muted">${t($ => $.create.sizeHelp)}</p>${error("blank")}
          <button class="primary" type="submit">${t($ => $.newPattern.create)}</button>
        </form>
      </section>
      <section class="creation-card" aria-labelledby="csv-heading">
        <div class="creation-icon">${icon(FileSpreadsheet)}</div><h2 id="csv-heading">${t($ => $.create.csv)}</h2>
        <p class="card-description">${t($ => $.create.csvDescription)}</p><p class="card-detail">${t($ => $.create.csvDetail)}</p>
        ${error("csv")}${flow.csvLoading ? html`<p class="import-progress" role="status">${t($ => $.create.readingCsv)}</p>` : nothing}
        <label class="import-button"><span>${t($ => $.app.openCsv)}</span>
          <input class="file-input" type="file" accept=".csv,text/csv" aria-label=${t($ => $.app.openCsv)} @change=${(event: Event) => {
            const input = event.target as HTMLInputElement, file = input.files?.[0];
            if (file) actions.import(file); input.value = "";
          }}>
        </label>
      </section>
      <section class="creation-card" aria-labelledby="picture-heading">
        <div class="creation-icon">${icon(ImagePlus)}</div><h2 id="picture-heading">${t($ => $.create.image)}</h2>
        <p class="card-description">${t($ => $.create.imageDescription)}</p><p class="card-detail">${t($ => $.create.imageDetail)}</p>
        ${imagePicker(t($ => $.app.openImage), t($ => $.app.openImage), actions.importImage)}
      </section>
    </div>
    ${error(null)}<p class="creation-note">${t($ => $.create.local)}</p>
  </main>`;
}

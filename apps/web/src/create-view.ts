import { html, nothing } from "lit-html";
import type { EditorModel, workflow$ } from "./state.js";
import type { Translate } from "./i18n/index.js";
import { imagePicker } from "./image-view.js";
import { FileSpreadsheet, Grid3x3, ImagePlus } from "@lucide/icons";
import { icon } from "./icon.js";
import { button } from "./ui/button.js";
import { field } from "./ui/field.js";

export interface CreateActions {
  create(width: number, height: number): void;
  import(file: File): void;
  importImage(file: File): void;
  resume(): void;
}
export function createView(
  model: EditorModel,
  flow: ReturnType<typeof workflow$.read>,
  actions: CreateActions,
  t: Translate,
) {
  function error(source: typeof flow.errorSource) {
    return model.error && flow.errorSource === source
      ? html`<p class="error" role="alert">${model.error}</p>`
      : nothing;
  }
  function dimension(name: "columns" | "rows") {
    return field(
      t(($) => $.newPattern[name]),
      html`<input
        class="w-full text-ui"
        type="number"
        name=${name}
        min="1"
        max="256"
        required
        .defaultValue=${"50"}
      />`,
      "ui",
    );
  }
  return html`<main
    class="create-page mx-auto mt-16 mb-8 w-[min(1120px,calc(100%_-_64px))] tablet:mt-10 tablet:w-[calc(100%_-_40px)] mobile:mt-8 mobile:w-[calc(100%_-_32px)]"
    aria-labelledby="create-heading"
  >
    <div class="mb-9 max-w-[660px] stack:mb-7">
      <span class="eyebrow">${t(($) => $.app.studio)}</span>
      <h1
        class="mt-3 mb-4 text-[clamp(30px,4vw,44px)] leading-[1.2] font-bold tracking-[-1.4px]"
        id="create-heading"
        tabindex="-1"
      >
        ${t(($) => $.create.heading)}
      </h1>
      <p class="m-0 text-[15px] leading-[1.8] text-secondary">${t(($) => $.create.intro)}</p>
    </div>
    ${flow.hasDocument
      ? html`<div
          class="resume-pattern mb-6 flex items-center justify-between gap-6 rounded-xl border border-solid border-import-border bg-subtle px-6 py-5 mobile:flex-col mobile:items-stretch mobile:gap-4"
        >
          <div>
            <span class="eyebrow">${t(($) => $.create.current)}</span
            ><strong class="block text-[16px] [overflow-wrap:anywhere]">${model.title}</strong>
            <p class="mt-2 mb-0 text-ui leading-[1.6] text-secondary" data-testid="counts">
              ${t(($) => $.beads, { count: model.beads })} ·
              ${t(($) => $.colors, { count: model.document.counts.size })}
            </p>
            <p class="mt-2 mb-0 text-ui leading-[1.6] text-secondary">
              ${t(($) => $.create.keepCurrent)}
            </p>
          </div>
          ${button(
            t(($) => $.create.resume),
            { className: "shrink-0", onClick: actions.resume },
          )}
        </div>`
      : nothing}
    <div class="creation-options grid grid-cols-3 gap-5 tablet:gap-3 stack:grid-cols-1 stack:gap-4">
      <section
        class="creation-card blank-card flex min-w-0 flex-col rounded-2xl border border-solid border-featured-border bg-surface p-7 tablet:p-[22px] stack:p-6"
        aria-labelledby="blank-heading"
      >
        <div class="creation-icon">${icon(Grid3x3)}</div>
        <h2 class="text-[20px] tracking-[-0.4px]" id="blank-heading">
          ${t(($) => $.create.blank)}
        </h2>
        <p class="mt-3.5 mb-6 text-body leading-[1.8] text-secondary">
          ${t(($) => $.create.blankDescription)}
        </p>
        <form
          class="blank-form mt-auto"
          novalidate
          @submit=${(event: Event) => {
            event.preventDefault();
            const data = new FormData(event.target as HTMLFormElement);
            actions.create(Number(data.get("columns")), Number(data.get("rows")));
          }}
        >
          <div class="grid grid-cols-2 gap-3">${dimension("columns")}${dimension("rows")}</div>
          <p class="muted mt-0 mb-[18px]">${t(($) => $.create.sizeHelp)}</p>
          ${error("blank")}
          ${button(
            t(($) => $.newPattern.create),
            { variant: "primary", type: "submit" },
          )}
        </form>
      </section>
      <section
        class="creation-card flex min-w-0 flex-col rounded-2xl border border-solid border-border bg-surface p-7 tablet:p-[22px] stack:p-6"
        aria-labelledby="csv-heading"
      >
        <div class="creation-icon">${icon(FileSpreadsheet)}</div>
        <h2 class="text-[20px] tracking-[-0.4px]" id="csv-heading">${t(($) => $.create.csv)}</h2>
        <p class="mt-3.5 mb-6 text-body leading-[1.8] text-secondary">
          ${t(($) => $.create.csvDescription)}
        </p>
        <p class="mt-auto mb-6 text-ui leading-[1.8] text-detail stack:mt-0 stack:mb-5">
          ${t(($) => $.create.csvDetail)}
        </p>
        ${error("csv")}${flow.csvLoading
          ? html`<p class="text-body text-accent" role="status">
              ${t(($) => $.create.readingCsv)}
            </p>`
          : nothing}
        <label class="import-button"
          ><span>${t(($) => $.app.openCsv)}</span>
          <input
            class="file-input"
            type="file"
            accept=".csv,text/csv"
            aria-label=${t(($) => $.app.openCsv)}
            @change=${(event: Event) => {
              const input = event.target as HTMLInputElement,
                file = input.files?.[0];
              if (file) actions.import(file);
              input.value = "";
            }}
          />
        </label>
      </section>
      <section
        class="creation-card flex min-w-0 flex-col rounded-2xl border border-solid border-border bg-surface p-7 tablet:p-[22px] stack:p-6"
        aria-labelledby="picture-heading"
      >
        <div class="creation-icon">${icon(ImagePlus)}</div>
        <h2 class="text-[20px] tracking-[-0.4px]" id="picture-heading">
          ${t(($) => $.create.image)}
        </h2>
        <p class="mt-3.5 mb-6 text-body leading-[1.8] text-secondary">
          ${t(($) => $.create.imageDescription)}
        </p>
        <p class="mt-auto mb-6 text-ui leading-[1.8] text-detail stack:mt-0 stack:mb-5">
          ${t(($) => $.create.imageDetail)}
        </p>
        ${imagePicker(
          t(($) => $.app.openImage),
          t(($) => $.app.openImage),
          actions.importImage,
        )}
      </section>
    </div>
    ${error(null)}
    <p class="mt-7 text-center text-ui leading-[1.8] text-detail">${t(($) => $.create.local)}</p>
  </main>`;
}

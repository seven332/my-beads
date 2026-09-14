import { h, type VNode } from "snabbdom";
import type { EditorModel, workflow$ } from "./state.js";
import type { Translate } from "./i18n/index.js";
import { imagePicker } from "./image-view.js";

export interface CreateActions {
  create(width: number, height: number): void;
  import(file: File): void;
  importImage(file: File): void;
  resume(): void;
}
export function createView(model: EditorModel, flow: ReturnType<typeof workflow$.read>, actions: CreateActions, t: Translate): VNode {
  function error(source: typeof flow.errorSource) {
    return model.error && flow.errorSource === source ? h("p.error", { attrs: { role: "alert" } }, model.error) : h("span");
  }
  function dimension(name: "columns" | "rows") {
    return h("label.field", [h("span", t($ => $.newPattern[name])), h("input", {
      attrs: { type: "number", name, min: 1, max: 256, required: true }, props: { defaultValue: "50" },
    })]);
  }
  return h("main.create-page", { key: "create", attrs: { "aria-labelledby": "create-heading" } }, [
    h("div.create-intro", [h("span.eyebrow", t($ => $.app.studio)),
      h("h1", { attrs: { id: "create-heading", tabindex: "-1" } }, t($ => $.create.heading)),
      h("p", t($ => $.create.intro))]),
    flow.hasDocument ? h("div.resume-pattern", [
      h("div", [h("span.eyebrow", t($ => $.create.current)), h("strong", model.title),
        h("p", { attrs: { "data-testid": "counts" } }, `${t($ => $.beads, { count: model.beads })} · ${t($ => $.colors, { count: model.document.counts.size })}`),
        h("p", t($ => $.create.keepCurrent))]),
      h("button", { attrs: { type: "button" }, on: { click: actions.resume } }, t($ => $.create.resume)),
    ]) : h("span"),
    h("div.creation-options", [
      h("section.creation-card.blank-card", { attrs: { "aria-labelledby": "blank-heading" } }, [
        h("div.creation-icon", { attrs: { "aria-hidden": "true" } }, "▦"),
        h("h2", { attrs: { id: "blank-heading" } }, t($ => $.create.blank)),
        h("p.card-description", t($ => $.create.blankDescription)),
        h("form.blank-form", { attrs: { novalidate: true }, on: { submit: (event: Event) => {
          event.preventDefault(); const data = new FormData(event.target as HTMLFormElement);
          actions.create(Number(data.get("columns")), Number(data.get("rows")));
        } } }, [h("div.field-row", [dimension("columns"), dimension("rows")]),
          h("p.muted", t($ => $.create.sizeHelp)),
          error("blank"),
          h("button.primary", { attrs: { type: "submit" } }, t($ => $.newPattern.create))]),
      ]),
      h("section.creation-card", { attrs: { "aria-labelledby": "csv-heading" } }, [
        h("div.creation-icon", { attrs: { "aria-hidden": "true" } }, "↥"),
        h("h2", { attrs: { id: "csv-heading" } }, t($ => $.create.csv)),
        h("p.card-description", t($ => $.create.csvDescription)),
        h("p.card-detail", t($ => $.create.csvDetail)),
        error("csv"),
        flow.csvLoading ? h("p.import-progress", { attrs: { role: "status" } }, t($ => $.create.readingCsv)) : h("span"),
        h("label.import-button", [h("span", t($ => $.app.openCsv)), h("input.file-input", {
          attrs: { type: "file", accept: ".csv,text/csv", "aria-label": t($ => $.app.openCsv) },
          on: { change: (event: Event) => {
            const input = event.target as HTMLInputElement, file = input.files?.[0];
            if (file) actions.import(file); input.value = "";
          } },
        })]),
      ]),
      h("section.creation-card", { attrs: { "aria-labelledby": "picture-heading" } }, [
        h("div.creation-icon", { attrs: { "aria-hidden": "true" } }, "◈"),
        h("h2", { attrs: { id: "picture-heading" } }, t($ => $.create.image)),
        h("p.card-description", t($ => $.create.imageDescription)),
        h("p.card-detail", t($ => $.create.imageDetail)),
        imagePicker(t($ => $.app.openImage), t($ => $.app.openImage), actions.importImage),
      ]),
    ]),
    error(null),
    h("p.creation-note", t($ => $.create.local)),
  ]);
}

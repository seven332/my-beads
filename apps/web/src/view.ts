import { h, type VNode, type Hooks } from "snabbdom";
import type { EditorModel, PaletteView, Tool, workflow$ } from "./state.js";
import { imageView, type ImageActions } from "./image-view.js";
import type { ImageSession } from "./image-state.js";
import type { DraftStatus } from "./drafts.js";
import { isLocale, localeNames, type Locale, type Translate } from "./i18n/index.js";
import { createView, type CreateActions } from "./create-view.js";
import { editorView } from "./editor-view.js";
import { exportView, type ExportActions } from "./export-view.js";
import type { ExportSettings } from "./export-state.js";
import { Grid3x3 } from "@lucide/icons";
import { icon } from "./icon.js";

export interface Actions extends ImageActions, CreateActions, ExportActions {
  tool(tool: Tool): void; color(code: string): void; search(value: string): void;
  rename(value: string): void; palette(open: boolean): void;
  undo(): void; redo(): void; grid(): void; codes(): void; zoom(factor: number): void; fit(): void;
  startNew(): void;
  paletteView(view: PaletteView): void; highlight(code: string | null): void; fitHighlight(): void;
  saveDraft(): void; language(locale: Locale): void;
}

export function view(model: EditorModel, actions: Actions, canvasHooks: Hooks, image: ImageSession | null,
  draft: DraftStatus & { message: string }, locale: Locale, t: Translate, flow: ReturnType<typeof workflow$.read>, exports: ExportSettings): VNode {
  const brand = h("a.brand", { attrs: { href: "#", "aria-label": t($ => $.app.name) },
    on: { click: (event: Event) => { event.preventDefault(); actions.startNew(); } } }, [h("span.brand-mark", [icon(Grid3x3)]), h("span.brand-name", t($ => $.app.name))]);
  const language = h("label.language-picker", [h("span", t($ => $.app.language)),
    h("select", { attrs: { "aria-label": t($ => $.app.language) }, props: { value: locale }, on: { change: (event: Event) => {
      const selected = (event.target as HTMLSelectElement).value; if (isLocale(selected)) actions.language(selected);
    } } }, Object.entries(localeNames).map(([code, name]) => h("option", { attrs: { value: code, lang: code }, props: { selected: code === locale } }, name)))]);
  const status = flow.hasDocument || draft.error ? h("div.draft-status", { key: "draft", attrs: { role: draft.error ? "alert" : "status", "aria-label": t($ => $.draft.status) } }, [
    h("span", draft.message), draft.action && flow.hasDocument ? h("button", { attrs: { type: "button" }, on: { click: actions.saveDraft } },
      draft.action === "replace" ? t($ => $.draft.replace) : t($ => $.draft.retry)) : h("span"),
  ]) : h("span", { key: "draft" });
  return h("div.workspace", { attrs: { lang: locale, "data-page": flow.page } }, [
    ...(flow.page === "create" ? [
      h("header.topbar", [brand, h("span.topbar-note", t($ => $.app.tagline)), language]),
      status, createView(model, flow, actions, t),
      h("footer.app-footer", [h("span", t($ => $.app.footer)), h("span", t($ => $.app.localFiles))]),
    ] : [editorView(model, actions, canvasHooks, t, brand, language, status, exports.open)]),
    imageView(image, actions, t), exportView(model, exports, actions, t),
  ]);
}

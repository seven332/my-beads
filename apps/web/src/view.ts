import { html, nothing } from "lit-html";
import { live } from "lit-html/directives/live.js";
import type { EditorModel, PaletteView, Tool, workflow$ } from "./state.js";
import { imageView, type ImageActions } from "./image-view.js";
import type { ImageSession } from "./image-state.js";
import type { DraftStatus } from "./drafts.js";
import { isLocale, localeNames, type Locale, type Translate } from "./i18n/index.js";
import { createView, type CreateActions } from "./create-view.js";
import { editorView } from "./editor-view.js";
import { exportView, type ExportActions } from "./export-view.js";
import type { ExportSettings } from "./export-state.js";
import type { ViewRefs } from "./view-lifecycle.js";
import { Grid3x3 } from "@lucide/icons";
import { icon } from "./icon.js";
import { keyboardHelp } from "./keyboard-help.js";
import { themePicker } from "./theme-view.js";
import type { ThemePreference } from "./theme-preference.js";
import type { Hsv, ColorChannel, ColorFormat } from "./color-picker.js";

export interface Actions extends ImageActions, CreateActions, ExportActions {
  tool(tool: Tool): void;
  color(code: string): void;
  search(value: string): void;
  colorPicker(open: boolean): void;
  colorFormat(format: ColorFormat): void;
  pickColor(update: Partial<Hsv>): void;
  colorChannel(channel: ColorChannel, text: string): void;
  commitColorChannel(channel: ColorChannel, format: ColorFormat): void;
  rename(value: string): void;
  palette(open: boolean): void;
  undo(): void;
  redo(): void;
  grid(): void;
  codes(): void;
  zoom(factor: number): void;
  fit(): void;
  startNew(): void;
  paletteView(view: PaletteView): void;
  highlight(code: string | null): void;
  fitHighlight(): void;
  saveDraft(): void;
  language(locale: Locale): void;
  theme(preference: ThemePreference): void;
  openKeyboardHelp(invoker?: HTMLElement): void;
  closeKeyboardHelp(): void;
}

export function view(
  model: EditorModel,
  actions: Actions,
  refs: ViewRefs,
  image: ImageSession | null,
  draft: DraftStatus & { message: string },
  locale: Locale,
  t: Translate,
  flow: ReturnType<typeof workflow$.read>,
  exports: ExportSettings,
  preference: ThemePreference,
) {
  const brand = html`<a
    class="brand"
    href="#"
    aria-label=${t(($) => $.app.name)}
    @click=${(event: Event) => {
      event.preventDefault();
      actions.startNew();
    }}
  >
    <span class="brand-mark">${icon(Grid3x3)}</span
    ><span class="brand-name">${t(($) => $.app.name)}</span></a
  >`;
  const language = html`<label class="language-picker"
    ><span>${t(($) => $.app.language)}</span>
    <select
      aria-label=${t(($) => $.app.language)}
      .value=${live(locale)}
      @change=${(event: Event) => {
        const selected = (event.target as HTMLSelectElement).value;
        if (isLocale(selected)) actions.language(selected);
      }}
    >
      ${Object.entries(localeNames).map(
        ([code, name]) =>
          html`<option value=${code} lang=${code} .selected=${code === locale}>${name}</option>`,
      )}
    </select></label
  >`;
  const preferences = html`<div class="preferences">
    ${themePicker(preference, actions.theme, t)}${language}
  </div>`;
  const status =
    flow.hasDocument || draft.error
      ? html`<div
          class="draft-status"
          role=${draft.error ? "alert" : "status"}
          aria-label=${t(($) => $.draft.status)}
        >
          <span>${draft.message}</span>${draft.action && flow.hasDocument
            ? html`<button type="button" @click=${actions.saveDraft}>
                ${draft.action === "replace" ? t(($) => $.draft.replace) : t(($) => $.draft.retry)}
              </button>`
            : nothing}
        </div>`
      : nothing;
  return html`<div class="workspace" lang=${locale} data-page=${flow.page}>
    ${flow.page === "create"
      ? html`
          <header class="topbar">
            ${brand}<span class="topbar-note">${t(($) => $.app.tagline)}</span>${preferences}
          </header>
          ${status}${createView(model, flow, actions, t)}
          <footer
            class="mt-auto flex justify-between gap-4 px-8 py-6 text-[10px] text-footer narrow:px-4 narrow:py-5"
          >
            <span>${t(($) => $.app.footer)}</span><span>${t(($) => $.app.localFiles)}</span>
          </footer>
        `
      : editorView(model, actions, refs, t, brand, preferences, status, exports.open)}
    ${imageView(image, actions, t, refs)}${exportView(
      model,
      exports,
      actions,
      t,
      refs.exportDialog,
    )}
    ${keyboardHelp(model.keyboardHelpOpen, actions.closeKeyboardHelp, t, refs.keyboardDialog)}
  </div>`;
}

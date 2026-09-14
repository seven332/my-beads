import { captureError } from "./errors.js";
import { LOCALE_KEY, resolveLocale } from "./i18n/index.js";
import { locale$, translation$, selectLocale$ } from "./locale.js";
import { createStore } from "ccstate";
import { render, nothing, type RootPart } from "lit-html";
import * as state from "./state.js";
import { view, type Actions } from "./view.js";
import { createViewLifecycle } from "./view-lifecycle.js";
import { editingArea, paletteIsOverlay } from "./canvas-viewport.js";
import { exportPattern } from "./exports.js";
import * as images from "./image-state.js";
import * as exports from "./export-state.js";
import { readImage } from "./image-file.js";
import { createDrafts, type DraftStorage } from "./drafts.js";

/** One mount owns the store, watcher, imports, Canvas resources and download URLs. */
export function mountApp(host: HTMLElement, adapters: { storage?: () => DraftStorage; readImage?: typeof readImage } = {}) {
  const store = createStore();
  const storage = adapters.storage ?? (() => window.localStorage);
  let savedLocale: string | null = null;
  try { savedLocale = storage().getItem(LOCALE_KEY); } catch { /* Language switching also works without storage. */ }
  store.set(selectLocale$, resolveLocale(savedLocale, navigator.languages.length ? navigator.languages : [navigator.language]));
  const lifetime = new AbortController();
  let importController: AbortController | undefined;
  let exportController: AbortController | undefined;
  const downloads = new Map<string, ReturnType<typeof setTimeout>>();
  const root = document.createElement("div"); host.append(root);
  let part: RootPart | undefined;
  const fail = (error: unknown) => {
    if (!lifetime.signal.aborted) store.set(state.reportError$, captureError(error));
  };
  const drafts = createDrafts(storage, status => store.set(state.reportDraft$, status));
  const recovered = drafts.load();
  if (recovered) store.set(state.restoreDocument$, recovered.grid, recovered.title);
  function cancelImport() { importController?.abort(); store.set(images.cancelImage$); store.set(state.cancelCsv$); }
  function closeExport() {
    const wasOpen = store.get(exports.exportSettings$).open;
    exportController?.abort(); store.set(exports.closeExport$);
    if (wasOpen) host.querySelector<HTMLButtonElement>(".document-actions .primary")?.focus({ preventScroll: true });
  }
  function flushDraft() { drafts.observe(store.get(state.committedDocument$)); drafts.flush(); }
  function fit() {
    if (paletteIsOverlay(host)) store.set(state.showPalette$, false);
    const area = editingArea(host);
    if (area) store.set(state.fitViewport$, area.width, area.height, area);
  }
  function palette(open: boolean) {
    store.set(state.showPalette$, open);
    // Browser focus scrolling can reveal only part of the field in a short panel.
    const panel = host.querySelector(".palette-panel");
    if (open && panel) panel.scrollTop = 0;
    const entry = store.get(state.editor$).paletteView === "all" ? ".palette-search" : '.palette-view button[aria-pressed="true"]';
    host.querySelector<HTMLElement>(open ? entry : ".palette-toggle")?.focus({ preventScroll: true });
  }
  function focusPage(selector: string) {
    host.scrollIntoView({ block: "start", behavior: "instant" });
    host.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  }
  function created() { fit(); focusPage(".title-input"); }
  const actions: Actions = {
    palette,
    paletteView: view => {
      store.set(state.selectPaletteView$, view);
      if (view === "all") host.querySelector<HTMLInputElement>(".palette-search")?.focus({ preventScroll: true });
    },
    highlight: code => {
      store.set(state.highlightColor$, code);
      if (code !== null && paletteIsOverlay(host)) {
        store.set(state.showPalette$, false);
        host.querySelector<HTMLElement>(store.get(state.editor$).highlightedColor ? ".highlight-clear" : ".palette-toggle")?.focus({ preventScroll: true });
      } else if (code === null) host.querySelector<HTMLCanvasElement>(".pattern-canvas")?.focus({ preventScroll: true });
    },
    fitHighlight: () => {
      if (paletteIsOverlay(host)) store.set(state.showPalette$, false);
      const area = editingArea(host);
      if (area) store.set(state.fitHighlightedColor$, area);
    },
    startNew: () => { cancelImport(); closeExport(); store.set(state.showCreate$); focusPage("h1"); },
    resume: () => { cancelImport(); store.set(state.showEditor$); focusPage(".title-input"); },
    openExport: () => store.set(exports.openExport$), closeExport,
    exportFormat: format => store.set(exports.selectExportFormat$, format),
    exportSize: (field, value) => store.set(exports.changeExportSize$, field, value),
    language: locale => {
      store.set(selectLocale$, locale);
      try { storage().setItem(LOCALE_KEY, locale); } catch { /* A preference failure must not interrupt editing. */ }
    },
    tool: tool => store.set(state.chooseTool$, tool), color: code => store.set(state.chooseColor$, code),
    search: value => store.set(state.searchPalette$, value), rename: value => store.set(state.rename$, value),
    create: (width, height) => { cancelImport(); if (store.set(state.newDocument$, width, height)) created(); },
    import: file => {
      cancelImport(); importController = new AbortController();
      const signal = AbortSignal.any([lifetime.signal, importController.signal]);
      store.set(state.importCsv$, file, signal).then(imported => { if (imported && !signal.aborted) created(); }, error => { if (!signal.aborted) fail(error); });
    },
    importImage: file => {
      cancelImport(); store.set(state.reportError$, ""); importController = new AbortController();
      const signal = AbortSignal.any([lifetime.signal, importController.signal]);
      store.set(images.loadImage$, { name: file.name, read: signal => (adapters.readImage ?? readImage)(file, signal) }, signal)
        .catch(error => { if (!signal.aborted) fail(error); });
    },
    updateImage: options => store.set(images.updateImage$, options),
    changeImageSettings: () => store.set(images.changeImageSettings$),
    overrideImage: (source, code) => store.set(images.overrideImage$, source, code),
    cancelImage: cancelImport,
    applyImage: () => { if (store.set(images.applyImage$)) { importController?.abort(); created(); } },
    saveDraft: () => drafts.retry(store.get(state.committedDocument$)),
    undo: () => store.set(state.undo$), redo: () => store.set(state.redo$),
    grid: () => store.set(state.toggleGrid$), codes: () => store.set(state.toggleCodes$),
    zoom: factor => {
      const area = editingArea(host);
      if (area) store.set(state.zoom$, factor, { x: area.x + area.width / 2, y: area.y + area.height / 2 });
    }, fit,
    export: options => {
      if (store.get(exports.exportSettings$).pending) return;
      store.set(state.finishStroke$); store.set(state.reportError$, "");
      exportController = new AbortController();
      const signal = AbortSignal.any([lifetime.signal, exportController.signal]);
      store.set(exports.reportExportPending$, true);
      const model = store.get(state.editor$);
      exportPattern(model.document, model.title, options, signal).then(({ blob, filename }) => {
        if (signal.aborted) return;
        store.set(exports.reportExportPending$, false);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url; link.download = filename;
        host.append(link); link.click(); link.remove();
        downloads.set(url, setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); }, 60_000));
      }, error => { if (!signal.aborted) { store.set(exports.reportExportPending$, false); fail(error); } });
    },
  };
  const lifecycle = createViewLifecycle({
    begin: point => store.set(state.beginStroke$, point), extend: point => store.set(state.extendStroke$, point),
    finish: cancel => store.set(state.finishStroke$, cancel),
    pan: (dx, dy) => store.set(state.moveViewport$, dx, dy),
    zoom: (factor, anchor) => store.set(state.zoom$, factor, anchor),
  });
  store.watch(get => {
    const model = get(state.editor$);
    const locale = get(locale$), t = get(translation$);
    document.documentElement.lang = locale;
    document.title = t($ => $.app.pageTitle);
    const image = get(images.imageSession$);
    part = render(view(model, actions, lifecycle.refs, image, get(state.draftStatus$), locale, t, get(state.workflow$), get(exports.exportSettings$)), root);
    lifecycle.sync(model, image);
    drafts.observe(get(state.committedDocument$));
  }, { signal: lifetime.signal });
  // watch runs immediately; fitting is outside the read-only watch callback.
  fit();
  function shortcut(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    // Safari can leave focus on body after a palette button is clicked.
    const paletteEscape = event.key === "Escape" && store.get(state.editor$).paletteOpen && paletteIsOverlay(host);
    if (!host.contains(target) && !(paletteEscape && target === document.body)) return;
    if (store.get(state.workflow$).page !== "edit" || store.get(exports.exportSettings$).open || store.get(images.imageSession$)) return;
    if (paletteEscape) {
      event.preventDefault(); palette(false); return;
    }
    if (target.matches("input, textarea, select") || target.isContentEditable) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault(); if (event.shiftKey) actions.redo(); else actions.undo();
    }
  }
  window.addEventListener("keydown", shortcut);
  window.addEventListener("pagehide", flushDraft);
  return {
    store,
    destroy() {
      if (lifetime.signal.aborted) return;
      flushDraft(); drafts.dispose(); window.removeEventListener("pagehide", flushDraft);
      lifetime.abort(); importController?.abort(); exportController?.abort(); window.removeEventListener("keydown", shortcut);
      for (const [url, timer] of downloads) { clearTimeout(timer); URL.revokeObjectURL(url); }
      downloads.clear(); lifecycle.destroy(); part?.setConnected(false); render(nothing, root); root.remove();
    },
  };
}

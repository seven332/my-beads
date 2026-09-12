import { createStore } from "ccstate";
import { init, h, attributesModule, propsModule, eventListenersModule, type VNode } from "snabbdom";
import * as state from "./state.js";
import { view, type Actions } from "./view.js";
import { mountCanvas } from "./canvas.js";
import { exportPattern } from "./exports.js";

/** One mount owns the store, watcher, imports, Canvas resources and download URLs. */
export function mountApp(host: HTMLElement) {
  const store = createStore();
  const lifetime = new AbortController();
  let importController: AbortController | undefined;
  const downloads = new Map<string, ReturnType<typeof setTimeout>>();
  const patch = init([attributesModule, propsModule, eventListenersModule]);
  const root = document.createElement("div"); host.append(root);
  let vnode: VNode | Element = root;
  let canvas: ReturnType<typeof mountCanvas> | undefined;
  const fail = (error: unknown) => {
    if (!lifetime.signal.aborted) store.set(state.reportError$, error instanceof Error ? error.message : String(error));
  };
  function fit() {
    const element = host.querySelector("canvas");
    if (element) { const rect = element.getBoundingClientRect(); store.set(state.fitViewport$, rect.width, rect.height); }
  }
  const actions: Actions = {
    tool: tool => store.set(state.chooseTool$, tool), color: code => store.set(state.chooseColor$, code),
    search: value => store.set(state.searchPalette$, value), rename: value => store.set(state.rename$, value),
    create: (width, height) => { importController?.abort(); store.set(state.newDocument$, width, height); fit(); },
    import: file => {
      importController?.abort(); importController = new AbortController();
      const signal = AbortSignal.any([lifetime.signal, importController.signal]);
      store.set(state.importCsv$, file, signal).then(imported => { if (imported && !signal.aborted) fit(); }, error => { if (!signal.aborted) fail(error); });
    },
    undo: () => store.set(state.undo$), redo: () => store.set(state.redo$),
    grid: () => store.set(state.toggleGrid$), codes: () => store.set(state.toggleCodes$),
    zoom: factor => {
      const rect = host.querySelector("canvas")!.getBoundingClientRect();
      store.set(state.zoom$, factor, { x: rect.width / 2, y: rect.height / 2 });
    }, fit,
    export: options => {
      store.set(state.finishStroke$); store.set(state.reportError$, "");
      const model = store.get(state.editor$);
      exportPattern(model.document, model.title, options, lifetime.signal).then(({ blob, filename }) => {
        if (lifetime.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url; link.download = filename;
        host.append(link); link.click(); link.remove();
        downloads.set(url, setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); }, 60_000));
      }, error => { if (!lifetime.signal.aborted) fail(error); });
    },
  };
  const canvasHooks = {
    insert(node: VNode) {
      canvas = mountCanvas(node.elm as HTMLCanvasElement, {
        begin: point => store.set(state.beginStroke$, point), extend: point => store.set(state.extendStroke$, point),
        finish: cancel => store.set(state.finishStroke$, cancel),
        pan: (dx, dy) => store.set(state.moveViewport$, dx, dy),
        zoom: (factor, anchor) => store.set(state.zoom$, factor, anchor),
      });
      canvas.update(store.get(state.editor$));
    },
    destroy() { canvas?.destroy(); canvas = undefined; },
  };
  store.watch(get => {
    const model = get(state.editor$);
    vnode = patch(vnode, view(model, actions, canvasHooks));
    canvas?.update(model);
  }, { signal: lifetime.signal });
  // watch runs immediately; fitting is outside the read-only watch callback.
  fit();
  function shortcut(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.matches("input, textarea, select") || target.isContentEditable) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault(); if (event.shiftKey) actions.redo(); else actions.undo();
    }
  }
  host.addEventListener("keydown", shortcut);
  return {
    store,
    destroy() {
      if (lifetime.signal.aborted) return;
      lifetime.abort(); importController?.abort(); host.removeEventListener("keydown", shortcut);
      for (const [url, timer] of downloads) { clearTimeout(timer); URL.revokeObjectURL(url); }
      downloads.clear(); vnode = patch(vnode, h("div")); (vnode.elm as Element).remove();
    },
  };
}

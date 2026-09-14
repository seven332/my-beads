import { html, nothing, type TemplateResult } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { ref, type Ref } from "lit-html/directives/ref.js";
import { defaultPalette } from "@my-beads/core";
import type { EditorModel } from "./state.js";
import type { Actions } from "./view.js";
import type { Translate } from "./i18n/index.js";
import { paletteResults, usedColors } from "./palette-view.js";
import { Download, Eraser, Hand, Minus, PaintBucket, Pencil, Pipette, Plus, Redo2, Undo2, X } from "@lucide/icons";
import { icon } from "./icon.js";

export function editorView(model: EditorModel, actions: Actions, canvas: Ref<HTMLCanvasElement>, t: Translate,
  brand: TemplateResult, language: TemplateResult, draft: TemplateResult | typeof nothing, exporting: boolean) {
  const grid = model.document.grid;
  return html`<main class="editor-layout" aria-label=${t($ => $.app.workspace)} data-palette-open=${String(model.paletteOpen)}>
    <div class="canvas-container"><canvas class="pattern-canvas" ${ref(canvas)}
      tabindex="0" role="img" aria-label=${t($ => $.app.canvas)} aria-describedby="canvas-help"></canvas></div>
    <header class="editor-topbar">
      <div class="editor-document floating-panel" data-canvas-panel>${brand}
        <input class="title-input" aria-label=${t($ => $.app.patternTitle)} maxlength="100" .value=${live(model.title)}
          @input=${(event: Event) => actions.rename((event.target as HTMLInputElement).value)}>
      </div>
      <div class="editor-actions floating-panel" data-canvas-panel>${language}
        <div class="document-actions">
          <button type="button" @click=${actions.startNew}>${t($ => $.create.new)}</button>
          <button type="button" class="primary with-icon" aria-label=${t($ => $.export.open)} @click=${actions.openExport}>${icon(Download)}<span>${t($ => $.export.open)}</span></button>
        </div>
      </div>
    </header>
    <div class="editor-dock" data-canvas-panel>
      <div class="editor-tools floating-panel" data-canvas-panel>
        <div class="tools" role="group" aria-label=${t($ => $.app.tools)}>
          ${([
            ["pencil", Pencil], ["eraser", Eraser], ["bucket", PaintBucket], ["eyedropper", Pipette], ["pan", Hand],
          ] as const).map(([tool, graphic]) => {
            const label = tool === "bucket" ? t($ => $.tools.bucketLabel) : tool === "eyedropper" ? t($ => $.tools.eyedropperLabel) : t($ => $.tools[tool]);
            return html`<button class="tool" type="button" aria-label=${label} title=${label} aria-pressed=${String(model.tool === tool)} @click=${() => actions.tool(tool)}>
              <span class="tool-icon">${icon(graphic)}</span><span class="tool-label">${t($ => $.tools[tool])}</span>
            </button>`;
          })}
        </div>
        <div class="history-controls">
          <button type="button" ?disabled=${!model.canUndo} aria-label=${t($ => $.app.undo)} title=${t($ => $.app.undo)} @click=${actions.undo}>${icon(Undo2)}</button>
          <button type="button" ?disabled=${!model.canRedo} aria-label=${t($ => $.app.redo)} title=${t($ => $.app.redo)} @click=${actions.redo}>${icon(Redo2)}</button>
        </div>
      </div>
      <div class="editor-navigation floating-panel" data-canvas-panel>
        <button class="palette-toggle" type="button" aria-label=${t($ => $.palette.open)} aria-controls="editor-palette" aria-expanded=${String(model.paletteOpen)} @click=${() => actions.palette(!model.paletteOpen)}>
          <span class="color-swatch" style=${`background:${defaultPalette.colors[model.color]}`}></span><span>${model.color}</span>
        </button>
        <div class="display-controls">
          <button type="button" aria-pressed=${String(model.gridVisible)} @click=${actions.grid}>${t($ => $.app.grid)}</button>
          <button type="button" aria-pressed=${String(model.codesVisible)} @click=${actions.codes}>${t($ => $.app.codes)}</button>
        </div>
        <div class="zoom-controls">
          <button type="button" aria-label=${t($ => $.app.zoomOut)} @click=${() => actions.zoom(1 / 1.25)}>${icon(Minus)}</button>
          <output aria-label=${t($ => $.app.zoomLevel)}>${Math.round(model.viewport.zoom / 12 * 100)}%</output>
          <button type="button" aria-label=${t($ => $.app.zoomIn)} @click=${() => actions.zoom(1.25)}>${icon(Plus)}</button>
          <button type="button" aria-label=${t($ => $.app.fitWindow)} @click=${actions.fit}>${t($ => $.app.fit)}</button>
        </div>
      </div>
    </div>
    <aside class="palette-panel floating-panel" id="editor-palette" aria-label=${t($ => $.palette.heading)} data-canvas-panel>
      <div class="section-heading"><h2>${t($ => $.palette.heading)}</h2><span class="tag">MARD 221</span>
        <button type="button" class="palette-close icon-button" aria-label=${t($ => $.palette.close)} @click=${() => actions.palette(false)}>${icon(X)}</button>
      </div>
      <div class="selected-color">
        <span class="selected-swatch" style=${`background:${defaultPalette.colors[model.color]}`}></span>
        <div><strong>${model.color}</strong><span>${defaultPalette.colors[model.color]}</span></div>
        <span class="selected-count">${t($ => $.beads, { count: model.document.counts.get(model.color) ?? 0 })}</span>
      </div>
      <div class="palette-view" role="group" aria-label=${t($ => $.palette.view)}>
        <button type="button" aria-pressed=${String(model.paletteView === "used")} @click=${() => actions.paletteView("used")}>${t($ => $.palette.used)}</button>
        <button type="button" aria-pressed=${String(model.paletteView === "all")} @click=${() => actions.paletteView("all")}>${t($ => $.palette.all)}</button>
      </div>
      ${model.paletteView === "all" ? html`<input class="palette-search" type="search" placeholder=${t($ => $.palette.searchPlaceholder)} aria-label=${t($ => $.palette.search)}
        .value=${live(model.search)} @input=${(event: Event) => actions.search((event.target as HTMLInputElement).value)}>` : nothing}
      ${model.paletteView === "all" ? paletteResults(model.paletteSearch, model.color, model.document.counts, actions.color, t) : usedColors(model, actions.color, actions.highlight, t)}
    </aside>
    <div class="editor-status floating-panel" data-canvas-panel>
      <div class="canvas-status"><span>${t($ => $.app.dimensions, { columns: grid[0].length, rows: grid.length })}</span>
        <span class="counts" data-testid="counts">${t($ => $.beads, { count: model.beads })} · ${t($ => $.colors, { count: model.document.counts.size })}</span>
      </div>
      ${model.highlightedColor ? html`<div class="highlight-status">
        <span class="highlight-summary" role="status">
          <span class="color-swatch" style=${`background:${defaultPalette.colors[model.highlightedColor]}`}></span>
          <span>${t($ => $.palette.highlighting, { code: model.highlightedColor })} · ${t($ => $.beads, { count: model.document.counts.get(model.highlightedColor) ?? 0 })}</span>
        </span>
        <button type="button" ?disabled=${!model.document.counts.has(model.highlightedColor)} @click=${actions.fitHighlight}>${t($ => $.palette.showLocations)}</button>
        <button type="button" class="highlight-clear" aria-label=${t($ => $.palette.clearHighlight)} title=${t($ => $.palette.clearHighlight)} @click=${() => actions.highlight(null)}>${icon(X)}</button>
      </div>` : nothing}
      ${draft}
    </div>
    <p class="canvas-help sr-only" id="canvas-help">${t($ => $.app.canvasHelp)}</p>
    ${model.error && !exporting ? html`<p class="editor-error error floating-panel" role="alert" data-canvas-panel>${model.error}</p>` : nothing}
  </main>`;
}

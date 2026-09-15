import { html, nothing, type TemplateResult } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { ref } from "lit-html/directives/ref.js";
import type { ViewRefs } from "./view-lifecycle.js";
import { colorSearch } from "./color-picker-view.js";
import { defaultPalette } from "@my-beads/core";
import type { EditorModel } from "./state.js";
import type { Actions } from "./view.js";
import type { Translate } from "./i18n/index.js";
import { paletteResults, usedColors } from "./palette-view.js";
import {
  Download,
  Eraser,
  Hand,
  Keyboard,
  Minus,
  PaintBucket,
  Pencil,
  Pipette,
  Plus,
  Redo2,
  Undo2,
  X,
} from "@lucide/icons";
import { icon } from "./icon.js";
import { shortcutHint, shortcuts } from "./shortcuts.js";
import { button, iconButton } from "./ui/button.js";

export function editorView(
  model: EditorModel,
  actions: Actions,
  refs: ViewRefs,
  t: Translate,
  brand: TemplateResult,
  language: TemplateResult,
  draft: TemplateResult | typeof nothing,
  exporting: boolean,
) {
  const grid = model.document.grid;
  return html`<main
    class="editor-layout"
    aria-label=${t(($) => $.app.workspace)}
    data-palette-open=${String(model.paletteOpen)}
    data-picker-sheet=${String(model.colorPicker.open && model.colorPicker.compact)}
  >
    <div class="canvas-container">
      <canvas
        class="pattern-canvas"
        ${ref(refs.canvas)}
        tabindex="0"
        role="img"
        aria-label=${t(($) => $.app.canvas)}
        aria-describedby="canvas-help"
      ></canvas>
    </div>
    <header class="editor-topbar">
      <div class="editor-document floating-panel" data-canvas-panel>
        ${brand}
        <input
          class="title-input"
          aria-label=${t(($) => $.app.patternTitle)}
          maxlength="100"
          .value=${live(model.title)}
          @input=${(event: Event) => actions.rename((event.target as HTMLInputElement).value)}
        />
        ${iconButton(
          t(($) => $.keyboard.heading),
          Keyboard,
          {
            className: "keyboard-help-button icon-button",
            title: shortcutHint(t, "help"),
            shortcut: shortcuts.help.aria,
            onClick: (event) => actions.openKeyboardHelp(event.currentTarget as HTMLElement),
          },
        )}
      </div>
      <div class="editor-actions floating-panel" data-canvas-panel>
        ${language}
        <div class="document-actions">
          ${button(
            t(($) => $.create.new),
            { onClick: actions.startNew },
          )}
          ${button(html`${icon(Download)}<span>${t(($) => $.export.open)}</span>`, {
            variant: "primary",
            className: "with-icon",
            label: t(($) => $.export.open),
            onClick: actions.openExport,
          })}
        </div>
      </div>
    </header>
    <div class="editor-dock" data-canvas-panel>
      <div class="editor-tools floating-panel" data-canvas-panel>
        <div class="tools" role="group" aria-label=${t(($) => $.app.tools)}>
          ${(
            [
              ["pencil", Pencil],
              ["eraser", Eraser],
              ["bucket", PaintBucket],
              ["eyedropper", Pipette],
              ["pan", Hand],
            ] as const
          ).map(([tool, graphic]) => {
            const label =
              tool === "bucket"
                ? t(($) => $.tools.bucketLabel)
                : tool === "eyedropper"
                  ? t(($) => $.tools.eyedropperLabel)
                  : t(($) => $.tools[tool]);
            return button(
              html`<span class="tool-icon">${icon(graphic)}</span
                ><span class="tool-label">${t(($) => $.tools[tool])}</span>`,
              {
                className: "tool",
                label,
                title: shortcutHint(t, tool),
                shortcut: shortcuts[tool].aria,
                pressed: model.tool === tool,
                onClick: () => actions.tool(tool),
              },
            );
          })}
        </div>
        <div class="history-controls">
          ${iconButton(
            t(($) => $.app.undo),
            Undo2,
            {
              disabled: !model.canUndo,
              title: shortcutHint(t, "undo"),
              shortcut: shortcuts.undo.aria,
              onClick: actions.undo,
            },
          )}
          ${iconButton(
            t(($) => $.app.redo),
            Redo2,
            {
              disabled: !model.canRedo,
              title: shortcutHint(t, "redo"),
              shortcut: shortcuts.redo.aria,
              onClick: actions.redo,
            },
          )}
        </div>
      </div>
      <div class="editor-navigation floating-panel" data-canvas-panel>
        ${button(
          html`<span
              class="color-swatch"
              style=${`background:${defaultPalette.colors[model.color]}`}
            ></span
            ><span>${model.color}</span>`,
          {
            className: "palette-toggle",
            label: t(($) => $.palette.open),
            controls: "editor-palette",
            expanded: model.paletteOpen,
            onClick: () => actions.palette(!model.paletteOpen),
          },
        )}
        <div class="display-controls">
          ${button(
            t(($) => $.app.grid),
            {
              title: shortcutHint(t, "grid"),
              shortcut: shortcuts.grid.aria,
              pressed: model.gridVisible,
              onClick: actions.grid,
            },
          )}
          ${button(
            t(($) => $.app.codes),
            {
              title: shortcutHint(t, "codes"),
              shortcut: shortcuts.codes.aria,
              pressed: model.codesVisible,
              onClick: actions.codes,
            },
          )}
        </div>
        <div class="zoom-controls">
          ${iconButton(
            t(($) => $.app.zoomOut),
            Minus,
            {
              title: shortcutHint(t, "zoomOut"),
              shortcut: shortcuts.zoomOut.aria,
              onClick: () => actions.zoom(1 / 1.25),
            },
          )}
          <output aria-label=${t(($) => $.app.zoomLevel)}
            >${Math.round((model.viewport.zoom / 12) * 100)}%</output
          >
          ${iconButton(
            t(($) => $.app.zoomIn),
            Plus,
            {
              title: shortcutHint(t, "zoomIn"),
              shortcut: shortcuts.zoomIn.aria,
              onClick: () => actions.zoom(1.25),
            },
          )}
          ${button(
            t(($) => $.app.fit),
            {
              label: t(($) => $.app.fitWindow),
              title: shortcutHint(t, "fit"),
              shortcut: shortcuts.fit.aria,
              onClick: actions.fit,
            },
          )}
        </div>
      </div>
    </div>
    <aside
      class="palette-panel floating-panel"
      id="editor-palette"
      aria-label=${t(($) => $.palette.heading)}
      data-canvas-panel
    >
      <div class="section-heading">
        <h2>${t(($) => $.palette.heading)}</h2>
        <span class="tag">MARD 221</span>
        ${iconButton(
          t(($) => $.palette.close),
          X,
          { className: "palette-close icon-button", onClick: () => actions.palette(false) },
        )}
      </div>
      <div class="selected-color">
        <span
          class="selected-swatch"
          style=${`background:${defaultPalette.colors[model.color]}`}
        ></span>
        <div><strong>${model.color}</strong><span>${defaultPalette.colors[model.color]}</span></div>
        <span class="selected-count"
          >${t(($) => $.beads, { count: model.document.counts.get(model.color) ?? 0 })}</span
        >
      </div>
      <div class="palette-view" role="group" aria-label=${t(($) => $.palette.view)}>
        ${button(
          t(($) => $.palette.used),
          { pressed: model.paletteView === "used", onClick: () => actions.paletteView("used") },
        )}
        ${button(
          t(($) => $.palette.all),
          { pressed: model.paletteView === "all", onClick: () => actions.paletteView("all") },
        )}
      </div>
      ${model.paletteView === "all" ? colorSearch(model, actions, refs, t) : nothing}
      ${model.paletteView === "all"
        ? model.colorPicker.open && model.colorPicker.compact
          ? nothing
          : paletteResults(
              model.paletteSearch,
              model.color,
              model.document.counts,
              actions.color,
              t,
            )
        : usedColors(model, actions.color, actions.highlight, t)}
    </aside>
    <div class="editor-status floating-panel" data-canvas-panel>
      <div class="canvas-status">
        <span>${t(($) => $.app.dimensions, { columns: grid[0].length, rows: grid.length })}</span>
        <span class="counts" data-testid="counts"
          >${t(($) => $.beads, { count: model.beads })} ·
          ${t(($) => $.colors, { count: model.document.counts.size })}</span
        >
      </div>
      ${model.highlightedColor
        ? html`<div class="highlight-status">
            <span class="highlight-summary" role="status">
              <span
                class="color-swatch"
                style=${`background:${defaultPalette.colors[model.highlightedColor]}`}
              ></span>
              <span
                >${t(($) => $.palette.highlighting, { code: model.highlightedColor })} ·
                ${t(($) => $.beads, {
                  count: model.document.counts.get(model.highlightedColor) ?? 0,
                })}</span
              >
            </span>
            ${button(
              t(($) => $.palette.showLocations),
              {
                disabled: !model.document.counts.has(model.highlightedColor),
                title: shortcutHint(t, "fitHighlight"),
                shortcut: shortcuts.fitHighlight.aria,
                onClick: actions.fitHighlight,
              },
            )}
            ${iconButton(
              t(($) => $.palette.clearHighlight),
              X,
              {
                className: "highlight-clear",
                title: t(($) => $.palette.clearHighlight),
                onClick: () => actions.highlight(null),
              },
            )}
          </div>`
        : nothing}
      ${draft}
    </div>
    <p class="canvas-help sr-only" id="canvas-help">${t(($) => $.app.canvasHelp)}</p>
    ${model.error && !exporting
      ? html`<p class="editor-error error floating-panel" role="alert" data-canvas-panel>
          ${model.error}
        </p>`
      : nothing}
  </main>`;
}

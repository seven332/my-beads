import { html, nothing } from "lit-html";
import { ref } from "lit-html/directives/ref.js";
import { RotateCcw, RotateCw, Minus, Plus, Scan, Sun, X } from "@lucide/icons";
import type { Translate } from "./i18n/index.js";
import type { ViewRefs } from "./view-lifecycle.js";
import type { PreviewSession } from "./preview-3d-state.js";
import type { PreviewAction } from "./preview-3d-controller.js";
import { modal } from "./ui/dialog.js";
import { iconButton } from "./ui/button.js";

export interface PreviewActions {
  preparePreview(): void;
  openPreview(): void;
  closePreview(): void;
  previewAction(action: PreviewAction): void;
  togglePreviewShadows(): void;
}
export function previewView(
  session: PreviewSession | null,
  actions: PreviewActions,
  refs: ViewRefs,
  t: Translate,
) {
  if (!session) return nothing;
  return modal(
    {
      ref: refs.previewDialog,
      labelledBy: "preview-heading",
      className: "preview-dialog",
      onCancel: actions.closePreview,
    },
    html`<header class="preview-heading">
        <div class="min-w-0">
          <h2 id="preview-heading">${t(($) => $.preview.heading)}</h2>
          <p class="preview-summary">
            ${session.title} ·
            ${t(($) => $.app.dimensions, {
              columns: session.grid[0].length,
              rows: session.grid.length,
            })}
            · ${t(($) => $.beads, { count: session.beads })}
          </p>
        </div>
        ${iconButton(
          t(($) => $.preview.close),
          X,
          { className: "icon-button", onClick: actions.closePreview },
        )}
      </header>
      <div class="preview-stage" data-status=${session.status}>
        <canvas
          class="preview-canvas"
          ${ref(refs.previewCanvas)}
          role="img"
          aria-label=${t(($) => $.preview.canvas)}
          aria-describedby="preview-help"
          tabindex="0"
        ></canvas>
        ${session.status !== "ready"
          ? html`<div
              class="preview-message"
              role=${session.status === "failed" ? "alert" : "status"}
            >
              <p>
                ${session.status === "failed"
                  ? t(($) => $.preview.failed)
                  : t(($) => $.preview.loading)}
              </p>
            </div>`
          : nothing}
        <div
          class="preview-controls floating-panel"
          role="group"
          aria-label=${t(($) => $.preview.controls)}
        >
          ${(
            [
              ["left", RotateCcw],
              ["right", RotateCw],
              ["out", Minus],
              ["in", Plus],
              ["reset", Scan],
            ] as const
          ).map(([action, graphic]) =>
            iconButton(
              t(($) => $.preview[action]),
              graphic,
              {
                disabled: session.status !== "ready",
                onClick: () => actions.previewAction(action),
              },
            ),
          )}
          ${iconButton(
            t(($) => $.preview.shadows),
            Sun,
            {
              disabled: session.status !== "ready" || !session.shadowsAvailable,
              pressed: session.shadows,
              title: session.shadowsAvailable
                ? t(($) => $.preview.shadowsHelp)
                : t(($) => $.preview.shadowsUnavailable),
              onClick: actions.togglePreviewShadows,
            },
          )}
        </div>
      </div>
      <footer class="preview-footer" id="preview-help">
        <p>${t(($) => $.preview.help)}</p>
        <p>
          ${t(($) => $.preview.note)}
          ${session.status === "ready" && !session.shadowsAvailable
            ? t(($) => $.preview.shadowsUnavailable)
            : t(($) => $.preview.shadowsHelp)}
        </p>
      </footer>`,
  );
}

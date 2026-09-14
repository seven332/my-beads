import { html, nothing } from "lit-html";
import { ref, type Ref } from "lit-html/directives/ref.js";
import { X } from "@lucide/icons";
import { icon } from "./icon.js";
import { shortcuts, type ShortcutId } from "./shortcuts.js";
import type { Translate } from "./i18n/index.js";

export function keyboardHelp(
  open: boolean,
  close: () => void,
  t: Translate,
  dialog: Ref<HTMLDialogElement>,
) {
  if (!open) return nothing;
  const group = (title: string, ids: ShortcutId[]) =>
    html`<section>
      <h3>${title}</h3>
      <dl>
        ${ids.map(
          (id) =>
            html`<div>
              <dt>${shortcuts[id].label(t)}</dt>
              <dd><kbd>${shortcuts[id].hint}</kbd></dd>
            </div>`,
        )}
      </dl>
    </section>`;
  return html`<dialog
    class="keyboard-dialog"
    ${ref(dialog)}
    aria-labelledby="keyboard-heading"
    @cancel=${(event: Event) => {
      event.preventDefault();
      close();
    }}
  >
    <div class="keyboard-heading">
      <h2 id="keyboard-heading">${t(($) => $.keyboard.heading)}</h2>
      <button
        class="icon-button"
        type="button"
        aria-label=${t(($) => $.keyboard.close)}
        @click=${close}
      >
        ${icon(X)}
      </button>
    </div>
    <p class="keyboard-note">${t(($) => $.keyboard.scope)}</p>
    <div class="keyboard-groups">
      ${group(
        t(($) => $.app.tools),
        ["pencil", "eraser", "bucket", "eyedropper", "pan"],
      )}
      ${group(
        t(($) => $.keyboard.view),
        ["zoomIn", "zoomOut", "fit", "fitHighlight", "grid", "codes"],
      )}
      <section>
        <h3>${t(($) => $.keyboard.canvas)}</h3>
        <dl>
          <div>
            <dt>${t(($) => $.keyboard.panHold)}</dt>
            <dd><kbd>Space</kbd></dd>
          </div>
          <div>
            <dt>${t(($) => $.keyboard.moveCell)}</dt>
            <dd><kbd>↑ ↓ ← →</kbd></dd>
          </div>
          <div>
            <dt>${t(($) => $.keyboard.panKeys)}</dt>
            <dd><kbd>Shift + ↑ ↓ ← →</kbd></dd>
          </div>
          <div>
            <dt>${t(($) => $.keyboard.apply)}</dt>
            <dd><kbd>Enter</kbd></dd>
          </div>
          <div>
            <dt>${t(($) => $.keyboard.cancel)}</dt>
            <dd><kbd>Esc</kbd></dd>
          </div>
        </dl>
      </section>
      ${group(
        t(($) => $.keyboard.general),
        ["undo", "redo", "help"],
      )}
    </div>
    <p class="keyboard-note">${t(($) => $.keyboard.highlightNote)}</p>
  </dialog>`;
}

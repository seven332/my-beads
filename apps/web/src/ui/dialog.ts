import { html, type TemplateResult } from "lit-html";
import { ref, type Ref } from "lit-html/directives/ref.js";

interface ModalOptions {
  ref: Ref<HTMLDialogElement>;
  labelledBy: string;
  className: string;
  onCancel: () => void;
}

/** The view lifecycle owns showModal/close; this helper only composes native markup. */
export function modal(options: ModalOptions, content: TemplateResult) {
  return html`<dialog
    class="dialog ${options.className}"
    ${ref(options.ref)}
    aria-labelledby=${options.labelledBy}
    @cancel=${(event: Event) => {
      event.preventDefault();
      options.onCancel();
    }}
  >
    ${content}
  </dialog>`;
}

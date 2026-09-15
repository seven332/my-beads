import { html, nothing, type TemplateResult } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { Check, ChevronDown } from "@lucide/icons";
import { icon } from "../icon.js";

interface Choice<T extends string> {
  value: T;
  label: string;
  lang?: string;
  graphic?: TemplateResult;
}

/** Selection stays controlled by the caller; mountSelects owns transient menu interaction. */
export function select<T extends string>(
  label: string,
  value: T,
  choices: readonly Choice<T>[],
  change: (value: T) => void,
  options: { name?: string; content?: TemplateResult; title?: string } = {},
) {
  return html`<span class="select-control" ?data-icon-only=${!!options.content}>
    <button
      class="select-trigger"
      type="button"
      tabindex="0"
      role="combobox"
      aria-label=${label}
      aria-haspopup="listbox"
      aria-expanded="false"
      name=${options.name ?? nothing}
      title=${options.title ?? nothing}
      .value=${live(value)}
      @change=${(event: Event) => {
        const next = choices.find(
          (choice) => choice.value === (event.currentTarget as HTMLButtonElement).value,
        );
        if (next) change(next.value);
      }}
    >
      ${options.content
        ? html`${options.content}<span class="sr-only"
              >${choices.find((choice) => choice.value === value)?.label}</span
            >`
        : html`<span class="select-value">
              <span>${choices.find((choice) => choice.value === value)?.label}</span>
              <span class="select-measure" aria-hidden="true"
                >${choices.map(
                  (choice) => html`<span lang=${choice.lang ?? nothing}>${choice.label}</span>`,
                )}</span
              > </span
            >${icon(ChevronDown)}`}
    </button>
    <span class="select-menu" role="listbox" aria-label=${label} popover="manual">
      ${choices.map(
        (choice) =>
          html`<span
            class="select-option"
            role="option"
            data-value=${choice.value}
            lang=${choice.lang ?? nothing}
            aria-selected=${String(choice.value === value)}
            >${choice.graphic}<span>${choice.label}</span>${icon(Check)}</span
          >`,
      )}
    </span>
  </span>`;
}

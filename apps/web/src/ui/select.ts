import { html, nothing, type TemplateResult } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { Check, ChevronDown } from "@lucide/icons";
import { icon } from "../icon.js";

interface Choice<T extends string> {
  value: T;
  label: string;
  lang?: string;
}

/** Selection stays controlled by the caller; mountSelects owns transient menu interaction. */
export function select<T extends string>(
  label: string,
  value: T,
  choices: readonly Choice<T>[],
  change: (value: T) => void,
  options: { name?: string; content?: TemplateResult; title?: string } = {},
) {
  return html`<span class="select-control">
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
      ${options.content ??
      html`<span class="select-value"
          >${choices.find((choice) => choice.value === value)?.label}</span
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
            ><span>${choice.label}</span>${icon(Check)}</span
          >`,
      )}
    </span>
  </span>`;
}

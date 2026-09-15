import { html, nothing, type TemplateResult } from "lit-html";
import { icon } from "../icon.js";

export interface ButtonOptions {
  variant?: "default" | "primary";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  label?: string;
  title?: string;
  shortcut?: string;
  pressed?: boolean;
  expanded?: boolean;
  controls?: string;
  onClick?: (event: MouseEvent) => void;
}

/** Native activation and state, with layout and translated content supplied by the view. */
export function button(content: string | TemplateResult, options: ButtonOptions = {}) {
  const classes = [options.variant === "primary" ? "primary" : "", options.className]
    .filter(Boolean)
    .join(" ");
  return html`<button
    class=${classes || nothing}
    type=${options.type ?? "button"}
    ?disabled=${options.disabled}
    aria-label=${options.label ?? nothing}
    title=${options.title ?? nothing}
    aria-keyshortcuts=${options.shortcut ?? nothing}
    aria-pressed=${options.pressed === undefined ? nothing : String(options.pressed)}
    aria-expanded=${options.expanded === undefined ? nothing : String(options.expanded)}
    aria-controls=${options.controls ?? nothing}
    @click=${options.onClick ?? nothing}
  >
    ${content}
  </button>`;
}

/** Icon-only controls always have an accessible name; size classes stay with their layout. */
export function iconButton(
  label: string,
  graphic: Parameters<typeof icon>[0],
  options: Omit<ButtonOptions, "label"> = {},
) {
  return button(icon(graphic), { ...options, label });
}

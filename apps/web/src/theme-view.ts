import { html } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { Monitor, Moon, Sun } from "@lucide/icons";
import { icon } from "./icon.js";
import { isThemePreference, type ThemePreference } from "./theme-preference.js";
import type { Translate } from "./i18n/index.js";

export function themePicker(
  preference: ThemePreference,
  select: (value: ThemePreference) => void,
  t: Translate,
) {
  return html`<label
    class="appearance-picker"
    title=${t(($) => $.appearance.current, { mode: t(($) => $.appearance[preference]) })}
  >
    ${icon(preference === "system" ? Monitor : preference === "dark" ? Moon : Sun)}
    <select
      aria-label=${t(($) => $.appearance.label)}
      .value=${live(preference)}
      @change=${(event: Event) => {
        const value = (event.target as HTMLSelectElement).value;
        if (isThemePreference(value)) select(value);
      }}
    >
      ${(["system", "light", "dark"] as const).map(
        (mode) =>
          html`<option value=${mode} .selected=${mode === preference}>
            ${t(($) => $.appearance[mode])}
          </option>`,
      )}
    </select>
  </label>`;
}

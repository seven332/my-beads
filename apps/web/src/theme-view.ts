import { html } from "lit-html";
import { select } from "./ui/select.js";
import { Moon, Sun, SunMoon } from "@lucide/icons";
import { icon } from "./icon.js";
import { type ThemePreference } from "./theme-preference.js";
import type { Translate } from "./i18n/index.js";

export function themePicker(
  preference: ThemePreference,
  change: (value: ThemePreference) => void,
  t: Translate,
) {
  return html`<span class="appearance-picker"
    >${select(
      t(($) => $.appearance.label),
      preference,
      (["system", "light", "dark"] as const).map((value) => ({
        value,
        label: t(($) => $.appearance[value]),
        graphic: icon(value === "system" ? SunMoon : value === "dark" ? Moon : Sun),
      })),
      change,
      {
        content: icon(preference === "system" ? SunMoon : preference === "dark" ? Moon : Sun),
        title: t(($) => $.appearance.current, { mode: t(($) => $.appearance[preference]) }),
      },
    )}</span
  >`;
}

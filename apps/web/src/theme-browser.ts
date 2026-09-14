import {
  applyTheme,
  readThemePreference,
  THEME_KEY,
  type Theme,
  type ThemePreference,
} from "./theme-preference.js";
import type { DraftStorage } from "./drafts.js";

/** One app mount owns its theme root and OS listener; only the page mount updates chrome. */
export function mountTheme(
  root: HTMLElement,
  storage: () => DraftStorage,
  systemChanged: (dark: boolean) => void,
) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const original = { theme: root.getAttribute("data-theme"), scheme: root.style.colorScheme };
  const chrome =
    root === document.documentElement
      ? document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      : null;
  const originalChrome = chrome?.content;
  let current: Theme | undefined;
  const change = () => systemChanged(media.matches);
  media.addEventListener("change", change);
  return {
    preference: readThemePreference(storage),
    systemDark: media.matches,
    sync(theme: Theme) {
      if (theme === current) return;
      current = theme;
      applyTheme(root, theme);
      if (chrome) chrome.content = getComputedStyle(root).getPropertyValue("--ui-page").trim();
    },
    save(preference: ThemePreference) {
      try {
        storage().setItem(THEME_KEY, preference);
      } catch {
        // The in-memory choice still applies when preferences cannot be saved.
      }
    },
    destroy() {
      media.removeEventListener("change", change);
      if (original.theme === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", original.theme);
      root.style.colorScheme = original.scheme;
      if (chrome && originalChrome !== undefined) chrome.content = originalChrome;
    },
  };
}

export type ThemePreference = "system" | "light" | "dark";
export type Theme = "light" | "dark";
export const THEME_KEY = "my-beads.theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function readThemePreference(storage: () => Pick<Storage, "getItem">): ThemePreference {
  try {
    const saved = storage().getItem(THEME_KEY);
    if (isThemePreference(saved)) return saved;
  } catch {
    // A denied preference store must not prevent startup or editing.
  }
  return "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

export function applyTheme(root: HTMLElement, theme: Theme) {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

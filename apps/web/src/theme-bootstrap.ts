import { applyTheme, readThemePreference, resolveTheme } from "./theme-preference.js";

// Vite inlines this dependency-free entry before styles and the application module.
applyTheme(
  document.documentElement,
  resolveTheme(
    readThemePreference(() => window.localStorage),
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  ),
);

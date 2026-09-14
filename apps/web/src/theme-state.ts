import { command, computed, state } from "ccstate";
import { resolveTheme, type ThemePreference } from "./theme-preference.js";

const preferenceState$ = state<ThemePreference>("system");
const systemDarkState$ = state(false);
export const themePreference$ = computed((get) => get(preferenceState$));
export const theme$ = computed((get) => resolveTheme(get(preferenceState$), get(systemDarkState$)));
export const selectTheme$ = command(({ set }, preference: ThemePreference) => {
  set(preferenceState$, preference);
});
export const systemThemeChanged$ = command(({ set }, dark: boolean) => {
  set(systemDarkState$, dark);
});

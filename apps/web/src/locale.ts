import { command, computed, state } from "ccstate";
import { DEFAULT_LOCALE, translator, type Locale } from "./i18n/index.js";

const localeState$ = state<Locale>(DEFAULT_LOCALE);
export const locale$ = computed(get => get(localeState$));
export const translation$ = computed(get => translator(get(localeState$)));
export const selectLocale$ = command(({ set }, locale: Locale) => { set(localeState$, locale); });

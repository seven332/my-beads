import { createInstance } from "i18next";
import en from "./locales/en-US.json";
import zh from "./locales/zh-CN.json";

export type Locale = "en-US" | "zh-CN";
export const DEFAULT_LOCALE: Locale = "en-US";
export const LOCALE_KEY = "my-beads.locale";
export const localeNames: Record<Locale, string> = { "en-US": "English", "zh-CN": "简体中文" };

// Both small bundles initialize synchronously; no network or loading UI is needed.
const i18n = createInstance({
  lng: DEFAULT_LOCALE, fallbackLng: DEFAULT_LOCALE, supportedLngs: Object.keys(localeNames),
  defaultNS: "common", initAsync: false, returnNull: false,
  interpolation: { escapeValue: false },
  resources: { "en-US": { common: en }, "zh-CN": { common: zh } },
}, error => { if (error) throw error; });

// Fixed translators keep independent ccstate stores from changing each other's language.
const translators = { "en-US": i18n.getFixedT("en-US"), "zh-CN": i18n.getFixedT("zh-CN") };
export type Translate = typeof translators[Locale];
export function translator(locale: Locale): Translate { return translators[locale]; }
export function isLocale(value: unknown): value is Locale { return value === "en-US" || value === "zh-CN"; }

export function resolveLocale(saved: unknown, languages: readonly string[]): Locale {
  if (isLocale(saved)) return saved;
  for (const language of languages) {
    const primary = language.toLowerCase().split("-")[0];
    if (primary === "en") return "en-US";
    if (primary === "zh") return "zh-CN";
  }
  return DEFAULT_LOCALE;
}

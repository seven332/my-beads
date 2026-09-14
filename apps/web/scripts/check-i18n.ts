import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function flatten(
  value: unknown,
  path = "",
  output = new Map<string, string>(),
): Map<string, string> {
  if (typeof value === "string" && value.trim()) output.set(path, value);
  else if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length
  ) {
    for (const [key, child] of Object.entries(value))
      flatten(child, path ? `${path}.${key}` : key, output);
  } else throw new Error(`Translation '${path}' must be a nonempty string or object.`);
  return output;
}
function placeholders(text: string): string {
  return [...text.matchAll(/\{\{([^{}]+)\}\}/g)]
    .map((match) => match[1].trim())
    .sort()
    .join("|");
}

/** Compare logical keys while respecting each language's plural categories. */
export function checkCatalogs(english: unknown, translated: unknown, locale: string): void {
  const source = flatten(english),
    target = flatten(translated);
  const expected = new Map<string, string>();
  for (const [key, text] of source) {
    if (key.endsWith("_one")) {
      if (!source.has(key.replace(/_one$/, "_other")))
        throw new Error(`Missing English plural: ${key}`);
      continue;
    }
    const keys = key.endsWith("_other")
      ? new Intl.PluralRules(locale)
          .resolvedOptions()
          .pluralCategories.map((category) => key.replace(/_other$/, `_${category}`))
      : [key];
    for (const localizedKey of keys) expected.set(localizedKey, text);
  }
  for (const [key, text] of expected) {
    const translation = target.get(key);
    if (translation === undefined) throw new Error(`Missing ${locale} translation: ${key}`);
    if (placeholders(text) !== placeholders(translation))
      throw new Error(`Mismatched ${locale} placeholders: ${key}`);
  }
  for (const key of target.keys())
    if (!expected.has(key)) throw new Error(`Unexpected ${locale} translation: ${key}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (locale: string): unknown =>
    JSON.parse(
      readFileSync(new URL(`../src/i18n/locales/${locale}.json`, import.meta.url), "utf8"),
    );
  const english = read("en-US");
  for (const locale of ["en-US", "zh-CN"]) checkCatalogs(english, read(locale), locale);
  console.log("English and Simplified Chinese translations have matching keys and placeholders.");
}

import { h, type VNode } from "snabbdom";
import type { PaletteSearchResult } from "./palette-search.js";

import type { Translate } from "./i18n/index.js";

export function paletteResults(result: PaletteSearchResult, selected: string,
  counts: ReadonlyMap<string, number>, choose: (code: string) => void, t: Translate): VNode {
  return h("div.palette-results", [
    result.inputHex ? h("div.search-source", [
      h("span.color-swatch", { attrs: { style: `background:${result.inputHex}` } }),
      h("div", [h("span", t($ => $.palette.input)), h("strong", result.inputHex)]),
    ]) : h("span"),
    result.kind === "recommendations" ? h("div.palette-recommendations", [
      h("p.search-summary", { attrs: { role: "status" } },
        t($ => $.palette.suggestions, { count: result.colors.length })),
      ...result.colors.map(({ code, hex, rules: matchingRules }) =>
        h("button.color-recommendation", { key: code, attrs: { type: "button",
          "aria-label": `${code} ${hex}`, "aria-pressed": String(selected === code),
          "aria-describedby": `palette-rules-${code}` }, on: { click: () => choose(code) } }, [
          h("span.recommendation-color", [
            h("span.color-swatch", { attrs: { style: `background:${hex}` } }),
            h("span", [h("strong", code), h("span.recommendation-hex", hex)]),
            h("span.recommendation-count", t($ => $.beads, { count: counts.get(code) ?? 0 })),
          ]),
          h("span.recommendation-rules", { attrs: { id: `palette-rules-${code}` } },
            matchingRules.map(rule => h("span.recommendation-rule", [
              h("strong", t($ => $.palette[rule].label)), h("span", t($ => $.palette[rule].description)),
            ]))),
        ])),
    ]) : h("div", [
      result.inputHex ? h("p.search-summary", { attrs: { role: "status" } }, t($ => $.palette.exact)) : h("span"),
      h("div.palette-grid", { attrs: { role: "group", "aria-label": t($ => $.palette.group) } }, result.colors.map(({ code, hex }) =>
        h("button.color", { key: code, attrs: { type: "button", "aria-label": `${code} ${hex}`,
          "aria-pressed": String(selected === code), title: `${code} · ${hex} · ${t($ => $.beads, { count: counts.get(code) ?? 0 })}` },
        on: { click: () => choose(code) } }, [
          h("span.color-swatch", { attrs: { style: `background:${hex}` } }),
          h("span.color-code", code), h("span.color-count", String(counts.get(code) || "·")),
        ]))),
      result.colors.length ? h("span") : h("p.empty-results", { attrs: { role: "status" } }, t($ => $.palette.empty)),
    ]),
  ]);
}

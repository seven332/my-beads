import { h, type VNode } from "snabbdom";
import type { MatchingRule, PaletteSearchResult } from "./palette-search.js";

const rules: Record<MatchingRule, { label: string; description: string }> = {
  closest: { label: "Closest color", description: "Smallest color difference across the full palette, including grays." },
  chroma: { label: "Preserve chroma", description: "Favors tinted colors over neutral grays when the input has a tint." },
};

export function paletteResults(result: PaletteSearchResult, selected: string,
  counts: ReadonlyMap<string, number>, choose: (code: string) => void): VNode {
  return h("div.palette-results", [
    result.inputHex ? h("div.search-source", [
      h("span.color-swatch", { attrs: { style: `background:${result.inputHex}` } }),
      h("div", [h("span", "Input color"), h("strong", result.inputHex)]),
    ]) : h("span"),
    result.kind === "recommendations" ? h("div.palette-recommendations", [
      h("p.search-summary", { attrs: { role: "status" } },
        `No exact match · ${result.colors.length} ${result.colors.length === 1 ? "suggestion" : "suggestions"}`),
      ...result.colors.map(({ code, hex, rules: matchingRules }) =>
        h("button.color-recommendation", { key: code, attrs: { type: "button",
          "aria-label": `${code} ${hex}`, "aria-pressed": String(selected === code),
          "aria-describedby": `palette-rules-${code}` }, on: { click: () => choose(code) } }, [
          h("span.recommendation-color", [
            h("span.color-swatch", { attrs: { style: `background:${hex}` } }),
            h("span", [h("strong", code), h("span.recommendation-hex", hex)]),
            h("span.recommendation-count", `${counts.get(code) ?? 0} beads`),
          ]),
          h("span.recommendation-rules", { attrs: { id: `palette-rules-${code}` } },
            matchingRules.map(rule => h("span.recommendation-rule", [
              h("strong", rules[rule].label), h("span", rules[rule].description),
            ]))),
        ])),
    ]) : h("div", [
      result.inputHex ? h("p.search-summary", { attrs: { role: "status" } }, "Exact match") : h("span"),
      h("div.palette-grid", { attrs: { role: "group", "aria-label": "MARD colors" } }, result.colors.map(({ code, hex }) =>
        h("button.color", { key: code, attrs: { type: "button", "aria-label": `${code} ${hex}`,
          "aria-pressed": String(selected === code), title: `${code} · ${hex} · ${counts.get(code) ?? 0} beads` },
        on: { click: () => choose(code) } }, [
          h("span.color-swatch", { attrs: { style: `background:${hex}` } }),
          h("span.color-code", code), h("span.color-count", String(counts.get(code) || "·")),
        ]))),
      result.colors.length ? h("span") : h("p.empty-results", { attrs: { role: "status" } }, "No matching colors."),
    ]),
  ]);
}

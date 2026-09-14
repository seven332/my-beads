import { html, nothing } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import type { PaletteSearchResult } from "./palette-search.js";
import type { Translate } from "./i18n/index.js";
import { defaultPalette } from "@my-beads/core";
import { ScanSearch } from "@lucide/icons";
import { icon } from "./icon.js";
import type { EditorModel } from "./state.js";

export function usedColors(
  model: EditorModel,
  choose: (code: string) => void,
  highlight: (code: string) => void,
  t: Translate,
) {
  return html`<div class="palette-results used-colors">
    <p class="used-help">${t(($) => $.palette.usedHelp)}</p>
    ${repeat(
      model.usedColors,
      ([code]) => code,
      ([code, count]) => {
        const hex = defaultPalette.colors[code],
          locating = model.highlightedColor === code;
        return html`<div class="used-color" data-highlighted=${String(locating)}>
          <button
            class="used-color-pick"
            type="button"
            aria-label=${`${code} ${hex}`}
            aria-pressed=${String(model.color === code)}
            aria-describedby=${`used-count-${code}`}
            @click=${() => choose(code)}
          >
            <span class="color-swatch" style=${`background:${hex}`}></span><strong>${code}</strong>
            <span class="used-count" id=${`used-count-${code}`}
              >${t(($) => $.beads, { count })}</span
            >
          </button>
          <button
            class="locate-color"
            type="button"
            aria-label=${t(($) => $.palette.locate, { code })}
            title=${t(($) => $.palette.locate, { code })}
            aria-pressed=${String(locating)}
            @click=${() => highlight(code)}
          >
            ${icon(ScanSearch)}
          </button>
        </div>`;
      },
    )}
    ${model.usedColors.length
      ? nothing
      : html`<p class="empty-results" role="status">${t(($) => $.palette.noUsed)}</p>`}
  </div>`;
}

export function paletteResults(
  result: PaletteSearchResult,
  selected: string,
  counts: ReadonlyMap<string, number>,
  choose: (code: string) => void,
  t: Translate,
) {
  return html`<div class="palette-results">
    ${result.inputHex
      ? html`<div class="search-source">
          <span class="color-swatch" style=${`background:${result.inputHex}`}></span>
          <div><span>${t(($) => $.palette.input)}</span><strong>${result.inputHex}</strong></div>
        </div>`
      : nothing}
    ${result.kind === "recommendations"
      ? html`<div class="palette-recommendations">
          <p class="search-summary" role="status">
            ${t(($) => $.palette.suggestions, { count: result.colors.length })}
          </p>
          ${repeat(
            result.colors,
            (color) => color.code,
            ({ code, hex, rules: matchingRules }) =>
              html` <button
                class="color-recommendation"
                type="button"
                aria-label=${`${code} ${hex}`}
                aria-pressed=${String(selected === code)}
                aria-describedby=${`palette-rules-${code}`}
                @click=${() => choose(code)}
              >
                <span class="recommendation-color">
                  <span class="color-swatch" style=${`background:${hex}`}></span>
                  <span
                    ><strong>${code}</strong><span class="recommendation-hex">${hex}</span></span
                  >
                  <span class="recommendation-count"
                    >${t(($) => $.beads, { count: counts.get(code) ?? 0 })}</span
                  >
                </span>
                <span class="recommendation-rules" id=${`palette-rules-${code}`}
                  >${matchingRules.map(
                    (rule) =>
                      html` <span class="recommendation-rule"
                        ><strong>${t(($) => $.palette[rule].label)}</strong
                        ><span>${t(($) => $.palette[rule].description)}</span></span
                      >`,
                  )}
                </span>
              </button>`,
          )}
        </div>`
      : html`<div>
          ${result.inputHex
            ? html`<p class="search-summary" role="status">${t(($) => $.palette.exact)}</p>`
            : nothing}
          <div class="palette-grid" role="group" aria-label=${t(($) => $.palette.group)}>
            ${repeat(
              result.colors,
              (color) => color.code,
              ({ code, hex }) =>
                html` <button
                  class="color"
                  type="button"
                  aria-label=${`${code} ${hex}`}
                  aria-pressed=${String(selected === code)}
                  title=${`${code} · ${hex} · ${t(($) => $.beads, { count: counts.get(code) ?? 0 })}`}
                  @click=${() => choose(code)}
                >
                  <span class="color-swatch" style=${`background:${hex}`}></span
                  ><span class="color-code">${code}</span
                  ><span class="color-count">${String(counts.get(code) || "·")}</span>
                </button>`,
            )}
          </div>
          ${result.colors.length
            ? nothing
            : html`<p class="empty-results" role="status">${t(($) => $.palette.empty)}</p>`}
        </div>`}
  </div>`;
}

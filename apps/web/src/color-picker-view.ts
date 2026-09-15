import { html, nothing } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { keyed } from "lit-html/directives/keyed.js";
import { ref, type Ref } from "lit-html/directives/ref.js";
import { defaultPalette } from "@my-beads/core";
import { X } from "@lucide/icons";
import { icon } from "./icon.js";
import { channelMax, colorFormats, formatChannels } from "./color-picker.js";
import type { EditorModel } from "./state.js";
import type { Actions } from "./view.js";
import type { Translate } from "./i18n/index.js";

export function colorSearch(
  model: EditorModel,
  actions: Actions,
  area: Ref<HTMLElement>,
  hue: Ref<HTMLInputElement>,
  t: Translate,
) {
  const { open, color, format } = model.colorPicker;
  const hex = color?.hex ?? defaultPalette.colors[model.color];
  return html`<div
    class="color-search"
    @keydown=${(event: KeyboardEvent) => {
      if (event.key === "Escape" && open && !event.isComposing) {
        event.preventDefault();
        actions.colorPicker(false);
      }
    }}
  >
    <div class="color-search-input">
      <button
        class="color-picker-toggle"
        type="button"
        aria-label=${t(($) => $.picker.open)}
        title=${t(($) => $.picker.open)}
        aria-expanded=${String(open)}
        aria-controls="color-picker"
        @click=${() => actions.colorPicker(!open)}
      >
        <span class="color-swatch" style=${`background:${hex}`}></span>
      </button>
      <input
        class="palette-search"
        type="search"
        placeholder=${t(($) => $.palette.searchPlaceholder)}
        aria-label=${t(($) => $.palette.search)}
        .value=${live(model.search)}
        @input=${(event: Event) => actions.search((event.target as HTMLInputElement).value)}
      />
    </div>
    ${open && color
      ? html`<section
          class="color-picker"
          id="color-picker"
          aria-label=${t(($) => $.picker.heading)}
        >
          <div class="color-picker-heading">
            <strong>${t(($) => $.picker.heading)}</strong>
            <button
              class="icon-button color-picker-close"
              type="button"
              aria-label=${t(($) => $.picker.close)}
              title=${t(($) => $.picker.close)}
              @click=${() => actions.colorPicker(false)}
            >
              ${icon(X)}
            </button>
          </div>
          <div
            class="color-area"
            ${ref(area)}
            aria-hidden="true"
            title=${t(($) => $.picker.drag)}
            style=${`--picker-hue:${color.hueHex}`}
          >
            <span
              class="color-area-thumb"
              style=${`left:${color.hsv.saturation}%;top:${100 - color.hsv.brightness}%;background:${color.hex}`}
            ></span>
          </div>
          <input
            class="color-hue"
            ${ref(hue)}
            type="range"
            min="0"
            max="360"
            step="0.1"
            aria-label=${t(($) => $.picker.hueSlider)}
            .value=${live(String(color.hsv.hue))}
            @input=${(event: Event) =>
              actions.pickColor({ hue: (event.target as HTMLInputElement).valueAsNumber })}
          />
          <div class="color-values">
            <label class="color-format">
              <span>${t(($) => $.picker.format)}</span>
              <select
                aria-label=${t(($) => $.picker.format)}
                @change=${(event: Event) => {
                  const value = (event.target as HTMLSelectElement).value;
                  const selected = colorFormats.find((item) => item === value);
                  if (selected) actions.colorFormat(selected);
                }}
              >
                ${colorFormats.map(
                  (item) =>
                    html`<option value=${item} .selected=${item === format}>
                      ${t(($) => $.picker.formats[item])}
                    </option>`,
                )}
              </select>
            </label>
            <div class="color-channels" data-format=${format}>
              ${keyed(
                format,
                formatChannels[format].map(
                  (channel) =>
                    html`<label
                      ><span>${t(($) => $.picker.short[channel])}</span>
                      ${channel === "hex"
                        ? html`<input
                            type="text"
                            spellcheck="false"
                            autocomplete="off"
                            pattern="#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})"
                            aria-label=${t(($) => $.picker.hex)}
                            .value=${live(color.fields.hex)}
                            @input=${(event: Event) =>
                              actions.colorChannel("hex", (event.target as HTMLInputElement).value)}
                            @blur=${() => actions.commitColorChannel("hex", format)}
                          />`
                        : html`<input
                            type="number"
                            min="0"
                            max=${channelMax(channel)}
                            step=${format === "rgb" ? "1" : "any"}
                            inputmode="decimal"
                            aria-label=${t(($) => $.picker[channel])}
                            .value=${live(color.fields[channel])}
                            @input=${(event: Event) =>
                              actions.colorChannel(
                                channel,
                                (event.target as HTMLInputElement).value,
                              )}
                            @blur=${() => actions.commitColorChannel(channel, format)}
                          />`}
                    </label>`,
                ),
              )}
            </div>
          </div>
          <p class="color-picker-help">${t(($) => $.picker.help)}</p>
        </section>`
      : nothing}
  </div>`;
}

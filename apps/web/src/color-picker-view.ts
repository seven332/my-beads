import { html, nothing } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { keyed } from "lit-html/directives/keyed.js";
import { ref } from "lit-html/directives/ref.js";
import { defaultPalette } from "@my-beads/core";
import { X } from "@lucide/icons";
import { button, iconButton } from "./ui/button.js";
import { channelMax, colorFormats, formatChannels } from "./color-picker.js";
import type { EditorModel } from "./state.js";
import type { Actions } from "./view.js";
import type { Translate } from "./i18n/index.js";
import type { ViewRefs } from "./view-lifecycle.js";
import { paletteResults } from "./palette-view.js";

export function colorSearch(model: EditorModel, actions: Actions, refs: ViewRefs, t: Translate) {
  const { open, color } = model.colorPicker;
  const hex = color?.hex ?? defaultPalette.colors[model.color];
  return html`<div class="color-search" ${ref(refs.colorSearch)}>
    <div class="color-search-input">
      ${button(html`<span class="color-swatch" style=${`background:${hex}`}></span>`, {
        className: "color-picker-toggle",
        label: t(($) => $.picker.open),
        title: t(($) => $.picker.open),
        expanded: open,
        controls: "color-picker",
        onClick: () => actions.colorPicker(!open),
      })}
      <input
        class="palette-search"
        type="search"
        placeholder=${t(($) => $.palette.searchPlaceholder)}
        aria-label=${t(($) => $.palette.search)}
        .value=${live(model.search)}
        @input=${(event: Event) => actions.search((event.target as HTMLInputElement).value)}
      />
    </div>
  </div>`;
}

export function colorPicker(model: EditorModel, actions: Actions, refs: ViewRefs, t: Translate) {
  const { open, color, format, compact } = model.colorPicker;
  if (!open || !color) return nothing;
  function commit(event: Event, channel: Parameters<Actions["commitColorChannel"]>[0]) {
    // Native close/show can move focus during a modality change. Keep input drafts then.
    const dialog = (event.target as HTMLElement).closest("dialog");
    if (dialog?.open && !dialog.hasAttribute("data-switching"))
      actions.commitColorChannel(channel, format);
  }
  return html`<dialog
    class="dialog color-picker"
    id="color-picker"
    ${ref(refs.colorDialog)}
    aria-labelledby="color-picker-heading"
    data-compact=${String(compact)}
    @cancel=${(event: Event) => {
      event.preventDefault();
      actions.colorPicker(false);
    }}
  >
    <div class="color-picker-heading">
      <strong id="color-picker-heading">${t(($) => $.picker.heading)}</strong>
      ${iconButton(
        t(($) => $.picker.close),
        X,
        {
          className: "icon-button color-picker-close",
          title: t(($) => $.picker.close),
          onClick: () => actions.colorPicker(false),
        },
      )}
    </div>
    <div class="color-picker-body">
      <div
        class="color-area"
        ${ref(refs.colorArea)}
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
        ${ref(refs.colorHue)}
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
                        @blur=${(event: Event) => commit(event, "hex")}
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
                          actions.colorChannel(channel, (event.target as HTMLInputElement).value)}
                        @blur=${(event: Event) => commit(event, channel)}
                      />`}
                </label>`,
            ),
          )}
        </div>
      </div>
      <p class="color-picker-help">${t(($) => $.picker.help)}</p>
      ${compact
        ? paletteResults(model.paletteSearch, model.color, model.document.counts, actions.color, t)
        : nothing}
    </div>
  </dialog>`;
}

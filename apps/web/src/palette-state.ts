import { command, computed, state } from "ccstate";
import { findPaletteColors, paletteTargetHex } from "./palette-search.js";
import {
  channelMax,
  colorFields,
  formatChannels,
  hsvToHsl,
  hslToHsv,
  hexToHsv,
  hsvToHex,
  type ColorChannel,
  type ColorFormat,
  type Hsv,
} from "./color-picker.js";

function pickerColor(hsv: Hsv, format: ColorFormat, whiteSaturation = 100) {
  return {
    hsv,
    // This is editing intent at white, not a second mutable color model.
    whiteSaturation: hsvToHsl(hsv, whiteSaturation).saturation,
    fields: colorFields(hsv, format, whiteSaturation),
  };
}
const searchState$ = state("");
const pickerOpenState$ = state(false);
const pickerCompactState$ = state(false);
export const setPickerCompact$ = command(({ set }, compact: boolean) => {
  set(pickerCompactState$, compact);
});
const pickerFormatState$ = state<ColorFormat>("hex");
const pickerColorState$ = state<ReturnType<typeof pickerColor> | null>(null);
export const paletteQuery$ = computed((get) => get(searchState$));
export const paletteSearch$ = computed((get) => findPaletteColors(get(searchState$)));
export const colorPicker$ = computed((get) => {
  const color = get(pickerColorState$);
  return {
    open: get(pickerOpenState$),
    compact: get(pickerCompactState$),
    format: get(pickerFormatState$),
    color: color
      ? {
          ...color,
          hex: hsvToHex(color.hsv),
          hueHex: hsvToHex({ ...color.hsv, saturation: 100, brightness: 100 }),
        }
      : null,
  };
});

export const searchPalette$ = command(({ get, set }, query: string) => {
  set(searchState$, query);
  const hex = paletteTargetHex(query);
  const color = get(pickerColorState$);
  if (hex)
    set(
      pickerColorState$,
      pickerColor(hexToHsv(hex, color?.hsv), get(pickerFormatState$), color?.whiteSaturation),
    );
});
export const showColorPicker$ = command(
  ({ get, set }, open: boolean, initialHex: string = "#000000") => {
    const color = get(pickerColorState$);
    const format = get(pickerFormatState$);
    if (open && !color) set(pickerColorState$, pickerColor(hexToHsv(initialHex), format));
    if (!open && color)
      set(pickerColorState$, pickerColor(color.hsv, format, color.whiteSaturation));
    set(pickerOpenState$, open);
  },
);
export const selectColorFormat$ = command(({ get, set }, format: ColorFormat) => {
  set(pickerFormatState$, format);
  const color = get(pickerColorState$);
  if (color) set(pickerColorState$, pickerColor(color.hsv, format, color.whiteSaturation));
});
export const pickColor$ = command(({ get, set }, update: Partial<Hsv>) => {
  const color = get(pickerColorState$);
  if (!color) return;
  const hsv = { ...color.hsv, ...update };
  if (Object.values(hsv).some((value) => !Number.isFinite(value))) return;
  hsv.hue = Math.max(0, Math.min(360, hsv.hue));
  hsv.saturation = Math.max(0, Math.min(100, hsv.saturation));
  hsv.brightness = Math.max(0, Math.min(100, hsv.brightness));
  set(pickerColorState$, pickerColor(hsv, get(pickerFormatState$), color.whiteSaturation));
  set(searchState$, hsvToHex(hsv));
});
export const editColorChannel$ = command(({ get, set }, channel: ColorChannel, text: string) => {
  const color = get(pickerColorState$);
  if (!color) return;
  const format = get(pickerFormatState$);
  if (!formatChannels[format].some((field) => field === channel)) return;
  const value = Number(text);
  let hsv: Hsv | undefined;
  let whiteSaturation = color.whiteSaturation;
  if (channel === "hex") {
    if (/^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(text.trim())) {
      hsv = hexToHsv(text.trim(), color.hsv);
    }
  } else if (text.trim() && Number.isFinite(value) && value >= 0 && value <= channelMax(channel)) {
    if (format === "rgb") {
      if (Number.isInteger(value)) {
        const rgb = colorFields(color.hsv, format, whiteSaturation);
        const hex = formatChannels.rgb
          .map((field) =>
            (field === channel ? value : Number(rgb[field])).toString(16).padStart(2, "0"),
          )
          .join("");
        hsv = hexToHsv(hex, color.hsv);
      }
    } else if (format === "hsl") {
      const hsl = { ...hsvToHsl(color.hsv, whiteSaturation), [channel]: value };
      hsv = hslToHsv(hsl);
      whiteSaturation = hsl.saturation;
    } else {
      hsv = { ...color.hsv, [channel]: value };
    }
  }
  const current = hsv ? pickerColor(hsv, format, whiteSaturation) : color;
  set(pickerColorState$, { ...current, fields: { ...current.fields, [channel]: text } });
  if (hsv) set(searchState$, hsvToHex(hsv));
});
export const commitColorChannel$ = command(
  ({ get, set }, channel: ColorChannel, format: ColorFormat) => {
    // Removing a focused field can emit blur synchronously during a Lit render.
    if (!get(pickerOpenState$) || get(pickerFormatState$) !== format) return;
    const color = get(pickerColorState$);
    if (color)
      set(pickerColorState$, {
        ...color,
        fields: {
          ...color.fields,
          [channel]: colorFields(color.hsv, get(pickerFormatState$), color.whiteSaturation)[
            channel
          ],
        },
      });
  },
);

import { command, computed, state } from "ccstate";
import { findPaletteColors, paletteTargetHex } from "./palette-search.js";
import {
  channelMax,
  channelText,
  hexToHsv,
  hsvToHex,
  type ColorChannel,
  type Hsv,
} from "./color-picker.js";

function pickerColor(hsv: Hsv) {
  return {
    hsv,
    fields: {
      hue: channelText(hsv.hue),
      saturation: channelText(hsv.saturation),
      brightness: channelText(hsv.brightness),
    },
  };
}
const searchState$ = state("");
const pickerOpenState$ = state(false);
const pickerColorState$ = state<ReturnType<typeof pickerColor> | null>(null);
export const paletteQuery$ = computed((get) => get(searchState$));
export const paletteSearch$ = computed((get) => findPaletteColors(get(searchState$)));
export const colorPicker$ = computed((get) => {
  const color = get(pickerColorState$);
  return {
    open: get(pickerOpenState$),
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
  if (hex) set(pickerColorState$, pickerColor(hexToHsv(hex, get(pickerColorState$)?.hsv)));
});
export const showColorPicker$ = command(
  ({ get, set }, open: boolean, initialHex: string = "#000000") => {
    const color = get(pickerColorState$);
    if (open && !color) set(pickerColorState$, pickerColor(hexToHsv(initialHex)));
    if (!open && color) set(pickerColorState$, pickerColor(color.hsv));
    set(pickerOpenState$, open);
  },
);
export const pickColor$ = command(({ get, set }, update: Partial<Hsv>) => {
  const color = get(pickerColorState$);
  if (!color) return;
  const hsv = { ...color.hsv, ...update };
  if (Object.values(hsv).some((value) => !Number.isFinite(value))) return;
  hsv.hue = Math.max(0, Math.min(360, hsv.hue));
  hsv.saturation = Math.max(0, Math.min(100, hsv.saturation));
  hsv.brightness = Math.max(0, Math.min(100, hsv.brightness));
  set(pickerColorState$, pickerColor(hsv));
  set(searchState$, hsvToHex(hsv));
});
export const editColorChannel$ = command(({ get, set }, channel: ColorChannel, text: string) => {
  const color = get(pickerColorState$);
  if (!color) return;
  const value = Number(text);
  if (text.trim() && Number.isFinite(value) && value >= 0 && value <= channelMax(channel)) {
    set(pickColor$, { [channel]: value });
  }
  const current = get(pickerColorState$)!;
  set(pickerColorState$, { ...current, fields: { ...current.fields, [channel]: text } });
});
export const commitColorChannel$ = command(({ get, set }, channel: ColorChannel) => {
  const color = get(pickerColorState$);
  if (color)
    set(pickerColorState$, {
      ...color,
      fields: { ...color.fields, [channel]: channelText(color.hsv[channel]) },
    });
});

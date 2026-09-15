import { normalizeHex } from "@my-beads/core";

export interface Hsv {
  hue: number;
  saturation: number;
  brightness: number;
}
export interface Hsl {
  hue: number;
  saturation: number;
  lightness: number;
}
export const colorFormats = ["hex", "rgb", "hsl", "hsb"] as const;
export type ColorFormat = (typeof colorFormats)[number];
export const formatChannels = {
  hex: ["hex"],
  rgb: ["red", "green", "blue"],
  hsl: ["hue", "saturation", "lightness"],
  hsb: ["hue", "saturation", "brightness"],
} as const;
export type ColorChannel = (typeof formatChannels)[ColorFormat][number];
export const channelMax = (channel: ColorChannel) =>
  channel === "hue" ? 360 : ["red", "green", "blue"].includes(channel) ? 255 : 100;
export const channelText = (value: number) => String(Math.round(value * 10) / 10);

/** Preserve HSL saturation at white, where HSV cannot express it. */
export function hsvToHsl(hsv: Hsv, whiteSaturation = 100): Hsl {
  const s = hsv.saturation / 100,
    v = hsv.brightness / 100,
    l = v * (1 - s / 2);
  return {
    hue: hsv.hue,
    saturation: l === 1 ? whiteSaturation : 100 * (l <= 0.5 ? s / (2 - s) : (v - l) / (1 - l)),
    lightness: l * 100,
  };
}

export function hslToHsv(hsl: Hsl): Hsv {
  const s = hsl.saturation / 100,
    l = hsl.lightness / 100,
    v = l + s * Math.min(l, 1 - l);
  return {
    hue: hsl.hue,
    saturation: Math.max(0, Math.min(100, 100 * (v === 0 ? (2 * s) / (1 + s) : 2 * (1 - l / v)))),
    brightness: v * 100,
  };
}

export function colorFields(hsv: Hsv, format: ColorFormat, whiteSaturation: number) {
  const hex = hsvToHex(hsv),
    hsl = hsvToHsl(hsv, whiteSaturation);
  return {
    hex,
    red: String(parseInt(hex.slice(1, 3), 16)),
    green: String(parseInt(hex.slice(3, 5), 16)),
    blue: String(parseInt(hex.slice(5, 7), 16)),
    hue: channelText(hsv.hue),
    saturation: channelText(format === "hsl" ? hsl.saturation : hsv.saturation),
    brightness: channelText(hsv.brightness),
    lightness: channelText(hsl.lightness),
  };
}

export function hexToHsv(
  hex: string,
  previous: Hsv = { hue: 0, saturation: 100, brightness: 100 },
): Hsv {
  const normalized = normalizeHex(hex);
  const [r, g, b] = [1, 3, 5].map(
    (offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255,
  );
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const hue =
    delta === 0
      ? previous.hue
      : 60 *
        (((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) +
          6) %
          6);
  return {
    hue,
    saturation: max === 0 ? previous.saturation : (delta / max) * 100,
    brightness: max * 100,
  };
}

export function hsvToHex({ hue, saturation, brightness }: Hsv): string {
  const s = saturation / 100,
    v = brightness / 100;
  const channel = (offset: number) => {
    const k = (offset + hue / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`.toUpperCase();
}

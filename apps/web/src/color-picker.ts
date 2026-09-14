import { normalizeHex } from "@my-beads/core";

export interface Hsv {
  hue: number;
  saturation: number;
  brightness: number;
}
export type ColorChannel = keyof Hsv;
export const colorChannels = ["hue", "saturation", "brightness"] as const;
export const channelMax = (channel: ColorChannel) => (channel === "hue" ? 360 : 100);
export const channelText = (value: number) => String(Math.round(value * 10) / 10);

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

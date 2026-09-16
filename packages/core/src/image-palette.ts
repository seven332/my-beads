import { deltaE2000, hexToLab, type Lab } from "./color-match.js";
import type { SampledImage } from "./image-import.js";

/** Select actual bead colors, using bounded representatives only for palette selection. */
export function selectImagePalette(
  sample: SampledImage,
  maximum: number,
  reserved: readonly string[],
  includeNeutral: boolean,
  candidates: [string, string][],
) {
  if (maximum >= candidates.length || sample.colors.length <= maximum) return candidates;
  const bins = new Map<string, { lab: number[]; count: number }>();
  for (const { hex, count } of sample.colors) {
    const key = sample.colors.length <= 4096 ? hex : [1, 3, 5].map((i) => hex[i]).join("");
    const bin = bins.get(key) ?? { lab: [0, 0, 0], count: 0 };
    const lab = hexToLab(hex);
    for (let i = 0; i < 3; i++) bin.lab[i] += lab[i] * count;
    bin.count += count;
    bins.set(key, bin);
  }
  const sources = [...bins.values()].map(({ lab, count }) => ({
    lab: [lab[0] / count, lab[1] / count, lab[2] / count] as Lab,
    count,
  }));
  const costs = candidates.map(([, hex]) => {
    const lab = hexToLab(hex);
    const neutral = Math.hypot(lab[1], lab[2]) < 5;
    return Float32Array.from(
      sources,
      (source) =>
        deltaE2000(source.lab, lab) ** 2 +
        (!includeNeutral && neutral && Math.hypot(source.lab[1], source.lab[2]) >= 5
          ? 1_000_000
          : 0),
    );
  });
  const selected = new Set(
    reserved.map((code) => candidates.findIndex(([candidate]) => candidate === code)),
  );
  const best = Float64Array.from(sources, (_, i) =>
    Math.min(...[...selected].map((index) => costs[index][i]), Infinity),
  );
  while (selected.size < maximum && sources.length) {
    let winner = -1,
      minimum = Infinity;
    for (let index = 0; index < candidates.length; index++) {
      if (selected.has(index)) continue;
      let total = 0;
      for (let i = 0; i < sources.length; i++)
        total += Math.min(best[i], costs[index][i]) * sources[i].count;
      if (total < minimum) {
        minimum = total;
        winner = index;
      }
    }
    const current = sources.reduce((sum, source, i) => sum + best[i] * source.count, 0);
    if (winner < 0 || minimum >= current) break;
    selected.add(winner);
    for (let i = 0; i < sources.length; i++) best[i] = Math.min(best[i], costs[winner][i]);
  }
  // Empty images still have a valid candidate palette; their grid remains entirely transparent.
  if (!selected.size) selected.add(0);
  return candidates.filter((_, index) => selected.has(index));
}

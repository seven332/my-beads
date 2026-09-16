// Synthetic 50 × 50 grid: two empty top rows, 1,270 beads, nine colors, 524 black beads.
// Literal colors keep the CLI pixel oracle independent of production palette/rendering code.
const colors = [
  "#000000",
  "#8D614C",
  "#56403C",
  "#2C2C2C",
  "#9A9D94",
  "#757D7B",
  "#FFFFFF",
  "#474747",
  "#644749",
];
export const patternCsv = Array.from({ length: 50 }, (_, y) =>
  Array.from({ length: 50 }, (_, x) => {
    const bead = y * 50 + x - 100;
    return bead < 0 || bead >= 1270
      ? "TRANSPARENT"
      : colors[bead < 524 ? 0 : 1 + ((bead - 524) % 8)];
  }).join(","),
).join("\n");

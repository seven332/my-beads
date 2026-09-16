// Test-owned geometry: two empty top rows isolate pencil/fill strokes from the filled region.
// Fifty columns exercise printable coordinate and legend layouts at realistic scale.
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

// A solid black 198 × 300 WebP, encoded once with Chromium Canvas.
export const sampleWebp = Buffer.from(
  "UklGRqYAAABXRUJQVlA4IJoAAABwEACdASrGACwBPm02mUmkIyKhICgAgA2JaW7hdrEbQAnsA99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJwoAD+/9YAAAAAAAAAAAAA",
  "base64",
);

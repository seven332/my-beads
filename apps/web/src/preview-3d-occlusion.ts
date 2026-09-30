import {
  type BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RedFormat,
} from "three";
import type { PatternGrid } from "@my-beads/core";
import { beadShape, pegboardLayout } from "./preview-3d-data.js";

function visibilityTexture(data: Uint8Array, width: number, height: number, mipmaps = false) {
  const texture = new DataTexture(data, width, height, RedFormat);
  texture.channel = 1;
  texture.colorSpace = NoColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = mipmaps ? LinearMipmapLinearFilter : LinearFilter;
  texture.generateMipmaps = mipmaps;
  texture.needsUpdate = true;
  return texture;
}

/** Shape-only visibility: radius across a bead wall, and height above its base. */
function localVisibility() {
  const width = 16;
  const height = 32;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const depth = 1 - y / (height - 1);
      const occlusion = (0.65 - (0.4 * x) / (width - 1)) * depth * depth;
      pixels[y * width + x] = Math.round(255 * (1 - occlusion));
    }
  return visibilityTexture(pixels, width, height);
}

/** Static receiver field; only occupied cells contribute bead footprints. */
function boardVisibility(grid: PatternGrid) {
  const layout = pegboardLayout(grid[0].length, grid.length);
  const density = Math.min(12, Math.floor(2048 / Math.max(layout.width, layout.depth)));
  const width = layout.width * density;
  const height = layout.depth * density;
  const pixels = new Uint8Array(width * height);

  // Tile the complete peg lattice, including its two-cell margin.
  for (let y = 0; y < density; y++) {
    const tile = new Uint8Array(density);
    for (let x = 0; x < density; x++) {
      const radius = Math.hypot((x + 0.5) / density - 0.5, (y + 0.5) / density - 0.5);
      const contact = Math.max(0, 1 - radius / 0.24);
      tile[x] = Math.round(255 * (1 - 0.35 * contact * contact));
    }
    const row = new Uint8Array(width);
    for (let x = 0; x < width; x += density) row.set(tile, x);
    for (let target = y; target < height; target += density) pixels.set(row, target * width);
  }

  // Reuse one finite stencil. The margin contains its full support even at a content corner.
  const stencil: { offset: number; visibility: number }[] = [];
  for (let y = -density; y < 2 * density; y++)
    for (let x = -density; x < 2 * density; x++) {
      const radius = Math.hypot((x + 0.5) / density - 0.5, (y + 0.5) / density - 0.5);
      const contact = Math.max(0, 1 - Math.max(0, radius - beadShape.radius) / 0.22);
      if (contact > 0)
        stencil.push({
          offset: y * width + x,
          visibility: Math.round(255 * (1 - 0.4 * contact * contact)),
        });
    }
  grid.forEach((row, y) =>
    row.forEach((code, x) => {
      if (code === null) return;
      const origin = (y + 2) * density * width + (x + 2) * density;
      for (const sample of stencil) {
        const index = origin + sample.offset;
        // Strongest contact wins: dense neighbors cannot accumulate unlimited darkness.
        pixels[index] = Math.min(pixels[index], sample.visibility);
      }
    }),
  );
  return visibilityTexture(pixels, width, height, true);
}

export function createPreviewOcclusion(grid: PatternGrid) {
  return { local: localVisibility(), board: boardVisibility(grid) };
}

export function setLocalOcclusionUV(geometry: BufferGeometry, kind: "bead" | "peg") {
  const positions = geometry.getAttribute("position");
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    const radius = Math.hypot(positions.getX(i), positions.getZ(i));
    const u = kind === "peg" ? 1 : (radius - beadShape.hole) / (beadShape.radius - beadShape.hole);
    const v =
      kind === "peg"
        ? positions.getY(i) / beadShape.pegHeight + 0.5
        : positions.getY(i) / beadShape.height;
    uv[i * 2] = Math.max(0, Math.min(1, u));
    uv[i * 2 + 1] = Math.max(0, Math.min(1, v));
  }
  geometry.setAttribute("uv1", new Float32BufferAttribute(uv, 2));
}

export function setBoardOcclusionUV(geometry: BufferGeometry, width: number, depth: number) {
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    // Constant UVs on slab sides/underside select the neutral corner at base LOD.
    if (normals.getY(i) < 0.5) continue;
    uv[i * 2] = positions.getX(i) / width + 0.5;
    uv[i * 2 + 1] = positions.getZ(i) / depth + 0.5;
  }
  geometry.setAttribute("uv1", new Float32BufferAttribute(uv, 2));
}

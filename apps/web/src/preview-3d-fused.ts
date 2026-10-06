import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { defaultPalette, type PatternGrid } from "@my-beads/core";
import { pegPosition } from "./preview-3d-data.js";

/** Illustrative cooled plastic: unobstructed rims spread farther than neighboring contacts. */
export const fusedShape = {
  height: 0.45,
  contactRadius: 0.56,
  freeRadius: 0.76,
  rim: 0.08,
  seam: 0.012,
  bend: 0.035,
};
const neighbors = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

/** Shared edge coordinates depend on the same incident cells on either side. */
function cellGeometry(mask: number, phase: number) {
  const { height, contactRadius, freeRadius, rim, seam, bend } = fusedShape;
  const neck = Math.sqrt(contactRadius * contactRadius - 0.25);
  const positions: number[] = [0, height, 0];
  const indices: number[] = [];
  const contour: [number, number, number][] = [];
  const exposed: boolean[] = [];
  const has = (x: number, z: number) =>
    Boolean(mask & (1 << neighbors.findIndex(([dx, dz]) => dx === x && dz === z)));
  // Counterclockwise from above. Three points per corner keep shared edges identical.
  for (const [x, z] of [
    [-1, -1],
    [-1, 1],
    [1, 1],
    [1, -1],
  ]) {
    const acrossX = has(x, 0);
    const acrossZ = has(0, z);
    // A clear quadrant permits more outward flow. Keep diagonal-only beads apart
    // and contact coordinates unchanged, including at three-bead junctions.
    const diagonal = has(x, z);
    const radius = diagonal ? contactRadius : freeRadius;
    const incoming = x === z ? acrossZ : acrossX;
    const outgoing = x === z ? acrossX : acrossZ;
    // Three or four incident beads meet at one junction. A pair joins at the
    // intersection of the spread disks; exposed corners retain the round bead shape.
    const junction = (acrossX && acrossZ) || ((acrossX || acrossZ) && diagonal);
    const end = (first: boolean): [number, number, number] => {
      const alongX = (x === z) === first;
      const adjacent = first ? incoming : outgoing;
      const along = junction ? 0.25 : adjacent ? neck / 2 : radius * Math.sin(Math.PI / 12);
      const across = adjacent ? 0.5 : radius * Math.cos(Math.PI / 12);
      return [
        x * (alongX ? along : across),
        height - (adjacent ? seam + (junction ? 0 : (rim - seam) / 4) : rim),
        z * (alongX ? across : along),
      ];
    };
    contour.push(
      end(true),
      [
        x * (junction || acrossX ? 0.5 : acrossZ ? neck : radius * Math.SQRT1_2),
        height - (acrossX && acrossZ && diagonal ? seam : rim),
        z * (junction || acrossZ ? 0.5 : acrossX ? neck : radius * Math.SQRT1_2),
      ],
      end(false),
    );
    exposed.push(!incoming, !outgoing, !outgoing);
  }
  // Fully surrounded cells need no external bevel ring. Their small relief remains closed.
  if (mask !== 255)
    for (const [x, , z] of contour) positions.push(x * (1 - 2 * rim), height, z * (1 - 2 * rim));
  const outer = positions.length / 3;
  for (const point of contour) positions.push(...point);
  const bottom = positions.length / 3;
  for (const [x, , z] of contour) positions.push(x, 0, z);
  const bottomCenter = positions.length / 3;
  positions.push(0, 0, 0);
  for (let i = 0; i < contour.length; i++) {
    const next = (i + 1) % contour.length;
    indices.push(0, 1 + i, 1 + next, bottomCenter, bottom + next, bottom + i);
    if (mask !== 255) indices.push(1 + i, outer + i, outer + next, 1 + i, outer + next, 1 + next);
    if (exposed[i])
      indices.push(outer + i, bottom + i, bottom + next, outer + i, bottom + next, outer + next);
  }
  // A small continuous warp softens color boundaries as well as the silhouette.
  // The four lattice phases give neighbors identical coordinates without per-cell
  // randomness, overlapping surfaces or extra vertices. Centers stay in place.
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    const sx = Math.sin(Math.PI * x) * (phase & 1 ? -1 : 1);
    const sz = Math.sin(Math.PI * z) * (phase & 2 ? -1 : 1);
    positions[i] += bend * sx * (Math.sin(2 * Math.PI * z) + 0.3 * sz);
    positions[i + 2] += bend * sz * (Math.sin(2 * Math.PI * x) - 0.3 * sx);
  }
  const geometry = new BufferGeometry();
  // CPU templates keep precision until final placement in the region's Float32 buffer.
  geometry.setAttribute("position", new BufferAttribute(new Float64Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** One bounded static mesh per occupied region; colors never require material groups. */
export function createFusedPreview(grid: PatternGrid) {
  const width = grid[0].length;
  const depth = grid.length;
  const templates = new Map<number, BufferGeometry>();
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  const meshes: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
  const bounds = new Box3();
  const color = new Color();
  const regionSize = 64;
  try {
    for (let top = 0; top < depth; top += regionSize)
      for (let left = 0; left < width; left += regionSize) {
        const cells: { x: number; z: number; code: string; geometry: BufferGeometry }[] = [];
        let vertices = 0;
        let count = 0;
        for (let row = top; row < Math.min(depth, top + regionSize); row++)
          for (let column = left; column < Math.min(width, left + regionSize); column++) {
            const code = grid[row][column];
            if (code === null) continue;
            let mask = 0;
            neighbors.forEach(([dx, dz], index) => {
              if (grid[row + dz]?.[column + dx] != null) mask |= 1 << index;
            });
            const phase = (column & 1) | ((row & 1) << 1);
            const key = mask * 4 + phase;
            let geometry = templates.get(key);
            if (!geometry) {
              geometry = cellGeometry(mask, phase);
              templates.set(key, geometry);
            }
            vertices += geometry.getAttribute("position").count;
            count += geometry.index!.count;
            cells.push({ ...pegPosition(column, row, width, depth), code, geometry });
          }
        if (!cells.length) continue;
        const positions = new Float32Array(vertices * 3);
        const normals = new Float32Array(vertices * 3);
        const colors = new Float32Array(vertices * 3);
        const indices = new Uint32Array(count);
        let vertex = 0;
        let index = 0;
        for (const cell of cells) {
          const source = cell.geometry.getAttribute("position");
          color.set(defaultPalette.colors[cell.code]);
          for (let i = 0; i < source.count; i++) {
            const offset = (vertex + i) * 3;
            positions[offset] = source.getX(i) + cell.x;
            positions[offset + 1] = source.getY(i);
            positions[offset + 2] = source.getZ(i) + cell.z;
            colors[offset] = color.r;
            colors[offset + 1] = color.g;
            colors[offset + 2] = color.b;
          }
          normals.set(cell.geometry.getAttribute("normal").array, vertex * 3);
          for (const value of cell.geometry.index!.array) indices[index++] = vertex + value;
          vertex += source.count;
        }
        const geometry = new BufferGeometry();
        const mesh = new Mesh(geometry, material);
        meshes.push(mesh);
        geometry.setAttribute("position", new BufferAttribute(positions, 3));
        geometry.setAttribute("normal", new BufferAttribute(normals, 3));
        geometry.setAttribute("color", new BufferAttribute(colors, 3));
        geometry.setIndex(new BufferAttribute(indices, 1));
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        // Keep culling conservative after square-root / squared-distance roundoff.
        geometry.boundingSphere!.radius += 1e-6;
        bounds.union(geometry.boundingBox!);
      }
  } catch (error) {
    for (const mesh of meshes) mesh.geometry.dispose();
    material.dispose();
    throw error;
  } finally {
    for (const geometry of templates.values()) geometry.dispose();
  }
  if (bounds.isEmpty())
    bounds.set(
      new Vector3(-width / 2, 0, -depth / 2),
      new Vector3(width / 2, fusedShape.height, depth / 2),
    );
  return {
    meshes,
    bounds,
    dispose() {
      for (const mesh of meshes) mesh.geometry.dispose();
      material.dispose();
    },
  };
}

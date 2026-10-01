import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { defaultPalette, type PatternGrid } from "@my-beads/core";
import { pegPosition } from "./preview-3d-data.js";

/** Illustrative cooled plastic; all bevels stay inside occupied cells. */
export const fusedShape = { height: 0.45, rim: 0.07, seam: 0.004 };
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
function cellGeometry(mask: number) {
  const { height, rim, seam } = fusedShape;
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
    const incoming = x === z ? acrossZ : acrossX;
    const outgoing = x === z ? acrossX : acrossZ;
    const inset = !acrossX && !acrossZ ? rim * (1 - Math.SQRT1_2) : 0;
    const end = (first: boolean): [number, number, number] => {
      const alongX = (x === z) === first;
      return [
        x * (alongX ? 0.5 - rim : 0.5),
        height - ((first ? incoming : outgoing) ? seam : rim),
        z * (alongX ? 0.5 : 0.5 - rim),
      ];
    };
    contour.push(
      end(true),
      [
        x * (0.5 - inset),
        height - (acrossX && acrossZ && has(x, z) ? seam : rim),
        z * (0.5 - inset),
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
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
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
            let geometry = templates.get(mask);
            if (!geometry) {
              geometry = cellGeometry(mask);
              templates.set(mask, geometry);
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

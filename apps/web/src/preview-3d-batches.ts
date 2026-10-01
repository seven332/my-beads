import {
  Box3,
  type BufferGeometry,
  type CylinderGeometry,
  type LatheGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  type MeshStandardMaterial,
  Sphere,
  Vector3,
} from "three";
import {
  beadShape,
  pegPosition,
  type pegboardLayout,
  type previewData,
} from "./preview-3d-data.js";
import type { createPreviewGeometries } from "./preview-3d-detail.js";

// At most 5 × 5 regions for the complete 260 × 260 lattice, including its margin.
const maxSpan = 64;

/** Static batches let every render pass cull with its own camera, without changing visibility. */
export function createPreviewBatches(
  data: ReturnType<typeof previewData>,
  layout: ReturnType<typeof pegboardLayout>,
  geometries: ReturnType<typeof createPreviewGeometries>,
  beadMaterial: MeshStandardMaterial,
  pegMaterial: MeshStandardMaterial,
) {
  const columns = Math.ceil(layout.width / maxSpan);
  const rows = Math.ceil(layout.depth / maxSpan);
  // Evenly sized regions avoid a tiny remainder batch along the board edges.
  const spanX = Math.ceil(layout.width / columns);
  const spanZ = Math.ceil(layout.depth / rows);
  const buckets = Array.from({ length: columns * rows }, () => [] as typeof data.beads);
  for (const bead of data.beads) {
    const x = bead.x + (layout.width - 1) / 2;
    const z = bead.z + (layout.depth - 1) / 2;
    buckets[Math.floor(z / spanZ) * columns + Math.floor(x / spanX)].push(bead);
  }
  const transform = new Matrix4();
  const color = new Color();
  const center = new Vector3();
  function batch<G extends BufferGeometry>(
    geometry: G,
    material: MeshStandardMaterial,
    count: number,
  ) {
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.boundingBox = new Box3();
    return mesh;
  }
  function place(mesh: InstancedMesh, index: number, x: number, y: number, z: number) {
    mesh.setMatrixAt(index, transform.makeTranslation(x, y, z));
    mesh.boundingBox!.expandByPoint(center.set(x, 0, z));
  }
  function finish(mesh: InstancedMesh, radius: number, height: number) {
    const box = mesh.boundingBox!;
    // Include Float32 rounding as well as every radial detail variant's full shape envelope.
    box.expandByVector(new Vector3(radius + 1e-6, 1e-6, radius + 1e-6));
    box.max.y = height + 1e-6;
    mesh.boundingSphere = box.getBoundingSphere(new Sphere());
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  const beads: InstancedMesh<LatheGeometry, MeshStandardMaterial>[] = [];
  const pegs: InstancedMesh<CylinderGeometry, MeshStandardMaterial>[] = [];
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const occupied = buckets[row * columns + column];
      if (occupied.length) {
        const mesh = batch(geometries.beads.get(6)!, beadMaterial, occupied.length);
        occupied.forEach((bead, index) => {
          place(mesh, index, bead.x, 0, bead.z);
          mesh.setColorAt(index, color.set(bead.color));
        });
        finish(mesh, beadShape.radius, beadShape.height);
        beads.push(mesh);
      }
      const left = column * spanX;
      const top = row * spanZ;
      const right = Math.min(layout.width, left + spanX);
      const bottom = Math.min(layout.depth, top + spanZ);
      const mesh = batch(geometries.pegs.get(4)!, pegMaterial, (right - left) * (bottom - top));
      let index = 0;
      for (let z = top; z < bottom; z++)
        for (let x = left; x < right; x++) {
          const position = pegPosition(x, z, layout.width, layout.depth);
          place(mesh, index++, position.x, beadShape.pegHeight / 2, position.z);
        }
      finish(mesh, beadShape.pegRadius, beadShape.pegHeight);
      pegs.push(mesh);
    }
  return { beads, pegs };
}

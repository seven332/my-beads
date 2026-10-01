import { expect, it, vi } from "vitest";
import { Box3, Color, Frustum, Matrix4, PerspectiveCamera, Vector3 } from "three";
import { defaultPalette } from "@my-beads/core";
import { createPegboardScene } from "../src/preview-3d-renderer.js";

it.each([
  [1, 1, "full"],
  [50, 50, "full"],
  [61, 67, "sparse"],
  [100, 100, "sparse"],
  [256, 256, "full"],
  [256, 256, "blank"],
  [1, 256, "sparse"],
  [256, 1, "full"],
] as const)("preserves every instance exactly once on %i×%i %s boards", (width, height, fill) => {
  const codes = ["H2", "H7", "B15"];
  const grid = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      fill === "blank" || (fill === "sparse" && (x + y) % 7 !== 0) ? null : codes[(x + y) % 3],
    ),
  );
  const model = createPegboardScene(grid);
  const expectedBeads = new Map<string, string>();
  const expectedPegs = new Set<string>();
  grid.forEach((row, y) =>
    row.forEach((code, x) => {
      if (code)
        expectedBeads.set(
          `${x - (width - 1) / 2},${y - (height - 1) / 2}`,
          defaultPalette.colors[code].slice(1).toLowerCase(),
        );
    }),
  );
  for (let y = 0; y < height + 4; y++)
    for (let x = 0; x < width + 4; x++)
      expectedPegs.add(`${x - (width + 3) / 2},${y - (height + 3) / 2}`);
  const actualBeads = new Map<string, string>();
  const actualPegs: string[] = [];
  const matrix = new Matrix4();
  const color = new Color();
  for (const mesh of model.beads)
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      mesh.getColorAt(i, color);
      expect(matrix.elements[13]).toBe(0);
      actualBeads.set(`${matrix.elements[12]},${matrix.elements[14]}`, color.getHexString());
    }
  for (const mesh of model.pegs)
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      actualPegs.push(`${matrix.elements[12]},${matrix.elements[14]}`);
    }
  expect(actualBeads).toEqual(expectedBeads);
  expect(model.beads.reduce((sum, mesh) => sum + mesh.count, 0)).toBe(expectedBeads.size);
  expect(new Set(actualPegs)).toEqual(expectedPegs);
  expect(actualPegs).toHaveLength(expectedPegs.size);
  expect(model.beads.length).toBeLessThanOrEqual(25);
  expect(model.pegs.length).toBeLessThanOrEqual(25);
  if (width === 50) expect([model.beads.length, model.pegs.length]).toEqual([1, 1]);
  model.dispose();
});

it("does not report a geometry change for an absent bead batch", () => {
  const model = createPegboardScene([[null]]);
  const camera = new PerspectiveCamera(40, 1, 0.05, 4000);
  camera.position.set(0, 10, 0);
  camera.lookAt(0, 0, 0);
  expect(model.updateDetail(camera, 10)).toBe(false);
  const geometry = model.pegs[0].geometry;
  expect(model.updateDetail(camera, 70)).toBe(false);
  expect(model.pegs[0].geometry).toBe(geometry);
  model.dispose();
});

it("contains every tier and instance within stable bounds and owns shared resources once", () => {
  const model = createPegboardScene(Array.from({ length: 67 }, () => Array<string>(61).fill("H2")));
  const meshes = [...model.beads, ...model.pegs];
  const spheres = meshes.map((mesh) => mesh.boundingSphere!.clone());
  const matrices = meshes.map((mesh) => mesh.instanceMatrix.array.slice());
  const camera = new PerspectiveCamera(40, 1, 0.05, 4000);
  const transform = new Matrix4();
  const box = new Box3();
  const disposed = vi.fn();
  for (const mesh of meshes) mesh.addEventListener("dispose", disposed);
  const materials = new Set(meshes.map((mesh) => mesh.material));
  const materialDisposed = vi.fn();
  for (const material of materials) material.addEventListener("dispose", materialDisposed);
  expect(materials.size).toBe(2);
  for (const distance of [3000, 250, 150, 90, 35, 10, 3000]) {
    camera.position.set(0, distance, 0);
    camera.lookAt(0, 0, 0);
    model.updateDetail(camera, 1000);
    expect(new Set(model.beads.map((mesh) => mesh.geometry)).size).toBe(1);
    expect(new Set(model.pegs.map((mesh) => mesh.geometry)).size).toBe(1);
    let contained = true;
    for (const [index, mesh] of meshes.entries()) {
      mesh.geometry.computeBoundingBox();
      for (let instance = 0; instance < mesh.count; instance++) {
        mesh.getMatrixAt(instance, transform);
        box.copy(mesh.geometry.boundingBox!).applyMatrix4(transform);
        contained &&= mesh.boundingBox!.containsBox(box);
      }
      expect(mesh.boundingSphere).toEqual(spheres[index]);
      expect(mesh.instanceMatrix.array).toEqual(matrices[index]);
    }
    expect(contained).toBe(true);
  }
  model.dispose();
  expect(disposed).toHaveBeenCalledTimes(meshes.length);
  expect(materialDisposed).toHaveBeenCalledTimes(2);
});

it("culls offscreen batches independently for each camera without losing boundary geometry", () => {
  const model = createPegboardScene(
    Array.from({ length: 100 }, () => Array<string>(100).fill("H2")),
  );
  model.scene.updateMatrixWorld(true);
  const camera = new PerspectiveCamera(40, 1, 0.05, 4000);
  const projection = new Matrix4();
  const frustum = new Frustum();
  const matrix = new Matrix4();
  const point = new Vector3();
  const meshes = [...model.beads, ...model.pegs];
  let culled = 0;
  for (const [x, y, z, targetX, targetZ, aspect] of [
    [0, 250, 120, 0, 0, 1], // fit
    [-30, 20, -25, -30, -30, 1], // close to a chunk boundary
    [48, 8, 50, 48, 48, 0.5], // narrow, oblique outer edge
    [-70, 15, 0, -30, 0, 2], // pan/orbit with wide resize
    [0, 250, 120, 0, 0, 1], // reset
  ]) {
    camera.aspect = aspect;
    camera.position.set(x, y, z);
    camera.lookAt(targetX, 0, targetZ);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    let missed = false;
    for (const mesh of meshes) {
      const visible = mesh.intersectsFrustum(frustum);
      if (!visible) culled++;
      const positions = mesh.geometry.getAttribute("position");
      // A visible vertex near an outside center still requires the complete batch.
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        for (let vertex = 0; vertex < positions.count; vertex += 7) {
          point.fromBufferAttribute(positions, vertex).applyMatrix4(matrix);
          if (frustum.containsPoint(point) && !visible) missed = true;
        }
      }
      expect(mesh.visible).toBe(true);
    }
    expect(missed).toBe(false);
    if (y === 250) expect(meshes.every((mesh) => mesh.intersectsFrustum(frustum))).toBe(true);
  }
  expect(culled).toBeGreaterThan(0);
  // A separate full-board light frustum accepts batches rejected by a near camera.
  const light = frustum.clone();
  camera.position.set(-40, 10, -35);
  camera.lookAt(-40, 0, -40);
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  expect(
    meshes.some((mesh) => !mesh.intersectsFrustum(frustum) && mesh.intersectsFrustum(light)),
  ).toBe(true);
  model.dispose();
});

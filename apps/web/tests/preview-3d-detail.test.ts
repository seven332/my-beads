import { expect, it, vi } from "vitest";
import { PerspectiveCamera, Raycaster, Vector3 } from "three";
import {
  beadSegments,
  createPreviewGeometries,
  detailTriangles,
  pegSegments,
  previewTriangleBudget,
  projectedPitch,
  selectPreviewDetail,
} from "../src/preview-3d-detail.js";
import { beadShape } from "../src/preview-3d-data.js";
import { createPegboardScene } from "../src/preview-3d-renderer.js";

it("selects more detail as projected shapes grow and holds a hysteresis band", () => {
  expect(selectPreviewDetail(1, 1, 25, 16)).toEqual({ bead: 6, peg: 4 });
  expect(selectPreviewDetail(1000, 1, 25, 16)).toEqual({ bead: 32, peg: 12 });
  const threshold = 0.35 / (beadShape.radius * (1 - Math.cos(Math.PI / 6)));
  const low = { bead: 6, peg: 4 };
  expect(selectPreviewDetail(threshold * 1.1, 1, 25, 16, low).bead).toBe(6);
  const high = selectPreviewDetail(threshold * 1.21, 1, 25, 16, low);
  expect(high.bead).toBe(8);
  for (const factor of [1.1, 0.95, 1.05, 0.9])
    expect(selectPreviewDetail(threshold * factor, 1, 25, 16, high).bead).toBe(8);
  expect(selectPreviewDetail(threshold * 0.79, 1, 25, 16, high).bead).toBe(6);
});

it("bounds blank/sparse/full and narrow boards including fixed guide work", () => {
  for (const [width, height] of [
    [1, 1],
    [1, 256],
    [256, 1],
    [17, 100],
    [50, 50],
    [100, 100],
    [256, 256],
  ]) {
    const pegs = (width + 4) * (height + 4);
    for (const beads of [0, Math.ceil((width * height) / 7), width * height]) {
      let previous;
      for (const pixels of [0, 1, 5, 10, 30, 1000, 1e6, 30, 1, NaN]) {
        const detail = selectPreviewDetail(pixels, beads, pegs, 30_000, previous);
        expect(beadSegments).toContain(detail.bead);
        expect(pegSegments).toContain(detail.peg);
        expect(detailTriangles(detail, beads, pegs, 30_000)).toBeLessThanOrEqual(
          previewTriangleBudget,
        );
        previous = detail;
      }
    }
  }
  // Occupancy, not just document area, determines available close-up quality.
  expect(selectPreviewDetail(1000, 1, 67600, 30_000).bead).toBe(32);
  expect(selectPreviewDetail(1000, 65536, 67600, 30_000).bead).toBe(8);
  for (let width = 1; width <= 256; width++)
    for (let height = 1; height <= 256; height++)
      expect(
        detailTriangles({ bead: 6, peg: 4 }, width * height, (width + 4) * (height + 4), 30_000),
      ).toBeLessThan(previewTriangleBudget);
});

it("uses real framebuffer scale and closest shape depth, including oblique and near-plane views", () => {
  const camera = new PerspectiveCamera(40, 1, 0.05, 4000);
  camera.position.set(0, 10, 0);
  camera.lookAt(0, 0, 0);
  const near = projectedPitch(camera, 5, 5, 1000);
  expect(projectedPitch(camera, 5, 5, 2000)).toBeCloseTo(near * 2);
  camera.position.set(0, 20, 0);
  expect(projectedPitch(camera, 5, 5, 1000)).toBeLessThan(near / 2);
  camera.position.set(0, 10, 10);
  camera.lookAt(0, 0, 0);
  expect(projectedPitch(camera, 20, 20, 1000)).toBeGreaterThan(projectedPitch(camera, 5, 5, 1000));
  camera.position.set(0, 0.1, 0);
  camera.lookAt(0, 0, 0);
  expect(projectedPitch(camera, 260, 260, 1000)).toBeCloseTo(
    (1000 * camera.projectionMatrix.elements[5]) / (2 * camera.near),
  );
});

it("prebuilds a finite set with physical bores, AO coordinates and exact triangle accounting", () => {
  const library = createPreviewGeometries();
  const disposed = vi.fn();
  expect(library.beads.size + library.pegs.size).toBe(9);
  for (const [kind, geometries] of [
    ["bead", library.beads],
    ["peg", library.pegs],
  ] as const) {
    for (const [segments, geometry] of geometries) {
      expect(geometry.index!.count / 3).toBe(segments * (kind === "bead" ? 14 : 4));
      const positions = geometry.getAttribute("position");
      const uv = geometry.getAttribute("uv1");
      expect(uv.count).toBe(positions.count);
      for (let i = 0; i < positions.count; i++) {
        const radius = Math.hypot(positions.getX(i), positions.getZ(i));
        expect(radius).toBeLessThanOrEqual(
          (kind === "bead" ? beadShape.radius : beadShape.pegRadius) + 1e-6,
        );
        if (kind === "bead") expect(radius).toBeGreaterThanOrEqual(beadShape.hole - 1e-6);
        expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
        expect(uv.getY(i)).toBeLessThanOrEqual(1);
      }
      geometry.addEventListener("dispose", disposed);
    }
  }
  library.dispose();
  expect(disposed).toHaveBeenCalledTimes(9);
});

it("reuses variants without moving instances and keeps invariant bounds across transitions", () => {
  const model = createPegboardScene([["H2", "H7", "B15"]]);
  const camera = new PerspectiveCamera(40, 1, 0.05, 4000);
  const matrices = model.beads[0].instanceMatrix.array.slice();
  const colors = model.beads[0].instanceColor!.array.slice();
  const material = model.beads[0].material;
  const bounds = model.beads[0].boundingSphere!.clone();
  const variants = new Map<number, (typeof model.beads)[number]["geometry"]>();
  const disposed = vi.fn();
  for (const distance of [3000, 250, 150, 90, 35, 10, 35, 90, 150, 250, 3000]) {
    camera.position.set(0, distance, 0);
    camera.lookAt(0, 0, 0);
    model.updateDetail(camera, 1000);
    const geometry = model.beads[0].geometry;
    const segments = geometry.parameters.segments;
    if (variants.has(segments)) expect(geometry).toBe(variants.get(segments));
    else {
      variants.set(segments, geometry);
      geometry.addEventListener("dispose", disposed);
    }
    expect(model.updateDetail(camera, 1000)).toBe(false);
    expect(model.beads[0].instanceMatrix.array).toEqual(matrices);
    expect(model.beads[0].instanceColor!.array).toEqual(colors);
    expect(model.beads[0].material).toBe(material);
    expect(model.beads[0].boundingSphere).toEqual(bounds);
    model.scene.updateMatrixWorld(true);
    const hole = new Raycaster(new Vector3(-0.86, 2, 0), new Vector3(0, -1, 0));
    expect(hole.intersectObject(model.beads[0])).toHaveLength(0);
    expect(hole.intersectObject(model.board)).toHaveLength(1);
    for (const mesh of [model.beads[0], model.pegs[0]]) {
      const box = mesh.boundingBox!;
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z])
            expect(mesh.boundingSphere!.distanceToPoint(new Vector3(x, y, z))).toBeLessThanOrEqual(
              1e-6,
            );
    }
  }
  expect(variants.size).toBe(5);
  model.dispose();
  expect(disposed).toHaveBeenCalledTimes(variants.size);
});

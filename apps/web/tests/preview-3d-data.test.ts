import { expect, it, vi } from "vitest";
import { Color, Matrix4, Raycaster, Vector3 } from "three";
import { defaultPalette } from "@my-beads/core";
import {
  previewBuffer,
  previewData,
  beadShape,
  pegboardLayout,
  pegPosition,
} from "../src/preview-3d-data.js";
import { createPegboardScene } from "../src/preview-3d-renderer.js";

it("preserves rectangular borders, square spacing, row direction and all MARD colors", () => {
  expect(
    previewData([
      [null, "H7", null],
      ["H2", null, null],
    ]),
  ).toEqual({
    width: 3,
    height: 2,
    beads: [
      { x: 0, z: -0.5, color: "#000000" },
      { x: -1, z: 0.5, color: "#FFFFFF" },
    ],
  });
  const entries = Object.entries(defaultPalette.colors);
  expect(previewData([entries.map(([code]) => code)]).beads.map((bead) => bead.color)).toEqual(
    entries.map(([, color]) => color),
  );
});

it("builds hollow beads, matching pegs, and a full board even for blank patterns", () => {
  const model = createPegboardScene([
    [null, "H7", null],
    ["H2", null, null],
  ]);
  expect([model.width, model.depth, model.beads.count, model.pegs.count]).toEqual([7, 6, 2, 6]);
  const matrix = new Matrix4();
  model.beads.getMatrixAt(0, matrix);
  expect(matrix.elements.slice(12, 15)).toEqual([0, 0, -0.5]);
  model.pegs.getMatrixAt(1, matrix);
  expect(matrix.elements[12]).toBe(0);
  expect(matrix.elements[14]).toBe(-0.5);
  const color = new Color();
  model.beads.getColorAt(1, color);
  expect(color.getHexString()).toBe("ffffff");
  const positions = model.beads.geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const radius = Math.hypot(positions.getX(i), positions.getZ(i));
    expect(radius).toBeGreaterThanOrEqual(beadShape.hole - 1e-6);
    expect(radius).toBeLessThanOrEqual(beadShape.radius + 1e-6);
  }
  const disposed = vi.fn();
  model.beads.addEventListener("dispose", disposed);
  model.pegs.addEventListener("dispose", disposed);
  model.beads.geometry.addEventListener("dispose", disposed);
  model.pegs.geometry.addEventListener("dispose", disposed);
  model.guides.geometry.addEventListener("dispose", disposed);
  model.guides.material.addEventListener("dispose", disposed);
  model.dispose();
  expect(disposed).toHaveBeenCalledTimes(6);
  const blank = createPegboardScene([
    [null, null],
    [null, null],
    [null, null],
  ]);
  expect(blank.beads.count).toBe(0);
  expect(blank.pegs.count).toBe(6);
  blank.dispose();
});

it("starts content two cells from the top-left board edge and alternates guides every five cells", () => {
  const layout = pegboardLayout(12, 7);
  expect([layout.width, layout.depth]).toEqual([16, 11]);
  expect(layout.guides).toEqual([
    { from: { x: -6, z: -3.5 }, to: { x: -6, z: 3.5 }, dashed: false },
    { from: { x: -1, z: -3.5 }, to: { x: -1, z: 3.5 }, dashed: true },
    { from: { x: 4, z: -3.5 }, to: { x: 4, z: 3.5 }, dashed: false },
    { from: { x: -6, z: -3.5 }, to: { x: 6, z: -3.5 }, dashed: false },
    { from: { x: -6, z: 1.5 }, to: { x: 6, z: 1.5 }, dashed: true },
  ]);
  const first = pegPosition(0, 0, 12, 7);
  const last = pegPosition(11, 6, 12, 7);
  // Two empty pitches, then a half-cell to the first/last peg center.
  expect([first.x + layout.width / 2, first.z + layout.depth / 2]).toEqual([2.5, 2.5]);
  expect([layout.width / 2 - last.x, layout.depth / 2 - last.z]).toEqual([2.5, 2.5]);
});

it("renders solid ink and real dash gaps between cells without marking the outer margin", () => {
  const model = createPegboardScene(Array.from({ length: 7 }, () => Array<null>(12).fill(null)));
  model.scene.updateMatrixWorld(true);
  const hits = (x: number, z: number) =>
    new Raycaster(new Vector3(x, 1, z), new Vector3(0, -1, 0)).intersectObject(model.guides)
      .length > 0;
  // Same top-left dash phase in both directions, including near the clipped far ends.
  expect(hits(-1, -3.25)).toBe(true);
  expect(hits(-1, -2.7)).toBe(false);
  expect(hits(-1, 2.75)).toBe(true);
  expect(hits(-1, 3.3)).toBe(false);
  expect(hits(-5.75, 1.5)).toBe(true);
  expect(hits(-5.2, 1.5)).toBe(false);
  expect(hits(5.25, 1.5)).toBe(true);
  expect(hits(5.8, 1.5)).toBe(false);
  expect(hits(4, -2.7)).toBe(true);
  expect(hits(4.05, -2.7)).toBe(false);
  expect(hits(-6.1, -3.5)).toBe(false);
  expect(hits(-6, -3.6)).toBe(false);
  expect(model.guides.material.depthTest).toBe(true);
  expect(model.guides.material.transparent).toBe(false);
  expect(model.guides.position.y).toBeGreaterThan(0);
  expect(model.guides.position.y).toBeLessThan(beadShape.height);
  model.dispose();
});

it.each([
  [1, 1],
  [1, 17],
  [17, 1],
  [6, 9],
  [10, 10],
  [256, 256],
])(
  "keeps a %i by %i board and its clipped guide triangles within their intended bounds",
  (columns, rows) => {
    const model = createPegboardScene(
      Array.from({ length: rows }, () => Array<null>(columns).fill(null)),
    );
    expect([model.width, model.depth]).toEqual([columns + 4, rows + 4]);
    expect(model.pegs.count).toBe(columns * rows);
    expect(model.beads.count).toBe(0);
    model.board.geometry.computeBoundingBox();
    expect(model.board.geometry.boundingBox!.getSize(new Vector3()).toArray()).toEqual([
      model.width,
      expect.closeTo(0.24),
      model.depth,
    ]);
    const positions = model.guides.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      expect(Math.abs(positions.getX(i))).toBeLessThanOrEqual(columns / 2);
      expect(Math.abs(positions.getZ(i))).toBeLessThanOrEqual(rows / 2);
      expect(positions.getY(i)).toBe(0);
    }
    // Upward winding makes the ink visible above the board without double-sided rendering.
    for (let i = 0; i < positions.count; i += 3) {
      const a = new Vector3().fromBufferAttribute(positions, i);
      const b = new Vector3().fromBufferAttribute(positions, i + 1);
      const c = new Vector3().fromBufferAttribute(positions, i + 2);
      expect(b.sub(a).cross(c.sub(a)).y).toBeGreaterThan(0);
    }
    expect(positions.count / 3).toBeLessThan(30_000);
    model.dispose();
  },
);

it("keeps all 65,536 beads with bounded geometry and framebuffer work", () => {
  const model = createPegboardScene(
    Array.from({ length: 256 }, () => Array<string>(256).fill("B15")),
  );
  expect(model.beads.count).toBe(65536);
  expect(model.pegs.count).toBe(65536);
  const triangles =
    (model.beads.geometry.index!.count / 3) * model.beads.count +
    (model.pegs.geometry.index!.count / 3) * model.pegs.count;
  expect(triangles).toBeLessThan(10_000_000);
  const matrix = new Matrix4();
  model.beads.getMatrixAt(65535, matrix);
  expect(matrix.elements.slice(12, 15)).toEqual([127.5, 0, 127.5]);
  model.dispose();
  for (const [width, height, dpr] of [
    [390, 650, 3],
    [1920, 1080, 2],
    [8000, 1000, 4],
  ]) {
    const buffer = previewBuffer(width, height, dpr);
    expect(buffer.width * buffer.height).toBeLessThanOrEqual(2_000_000);
    expect(Math.max(buffer.width, buffer.height)).toBeLessThanOrEqual(4096);
  }
});

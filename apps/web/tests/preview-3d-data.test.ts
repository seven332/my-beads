import { expect, it, vi } from "vitest";
import { Color, Matrix4 } from "three";
import { defaultPalette } from "@my-beads/core";
import { previewBuffer, previewData, beadShape } from "../src/preview-3d-data.js";
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
  expect([model.width, model.depth, model.beads.count, model.pegs.count]).toEqual([3.6, 2.6, 2, 6]);
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
  model.dispose();
  expect(disposed).toHaveBeenCalledTimes(4);
  const blank = createPegboardScene([
    [null, null],
    [null, null],
    [null, null],
  ]);
  expect(blank.beads.count).toBe(0);
  expect(blank.pegs.count).toBe(6);
  blank.dispose();
});

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

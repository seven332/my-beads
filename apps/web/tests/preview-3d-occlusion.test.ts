import { expect, it, vi } from "vitest";
import { type DataTexture, NoColorSpace, Raycaster, Vector3 } from "three";
import { createPegboardScene } from "../src/preview-3d-renderer.js";
import { createPreviewOcclusion } from "../src/preview-3d-occlusion.js";

function sample(texture: DataTexture, u: number, v: number) {
  const { data, width, height } = texture.image;
  const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(v * height)));
  return data![y * width + x];
}

it("shades cavity depth and outer bases while preserving upper rims and peg tops", () => {
  const model = createPegboardScene([["H2"]]);
  const texture = model.beads.material.aoMap as DataTexture;
  expect(model.pegs.material.aoMap).toBe(texture);
  expect(texture.colorSpace).toBe(NoColorSpace);
  expect(texture.channel).toBe(1);
  expect(sample(texture, 0, 0)).toBeLessThan(sample(texture, 1, 0));
  expect(sample(texture, 1, 0)).toBeLessThan(255);
  expect(sample(texture, 0, 0.5)).toBeGreaterThan(sample(texture, 0, 0));
  for (const u of [0, 0.5, 1]) expect(sample(texture, u, 1)).toBe(255);

  for (const mesh of [model.beads, model.pegs]) {
    const positions = mesh.geometry.getAttribute("position");
    const uv = mesh.geometry.getAttribute("uv1");
    let top = -Infinity;
    let bottom = Infinity;
    for (let i = 0; i < positions.count; i++) {
      top = Math.max(top, positions.getY(i));
      bottom = Math.min(bottom, positions.getY(i));
    }
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) === top) expect(sample(texture, uv.getX(i), uv.getY(i))).toBe(255);
      if (positions.getY(i) === bottom)
        expect(sample(texture, uv.getX(i), uv.getY(i))).toBeLessThan(255);
    }
  }
  model.scene.updateMatrixWorld(true);
  const hole = new Raycaster(new Vector3(0.14, 2, 0), new Vector3(0, -1, 0));
  expect(hole.intersectObject(model.beads)).toHaveLength(0);
  expect(hole.intersectObject(model.board)[0].point.y).toBeCloseTo(0);
  model.dispose();
});

it("places contacts only around actual occupied cells and keeps the peg margin", () => {
  const grid = Array.from({ length: 4 }, () => Array<string | null>(7).fill(null));
  const blank = createPreviewOcclusion(grid);
  grid[0][0] = "H2";
  grid[3][6] = "F13";
  const occupied = createPreviewOcclusion(grid);
  const at = (map: DataTexture, x: number, y: number) => sample(map, x / 11, y / 8);
  for (const [x, y] of [
    [2.5, 2.5],
    [8.5, 5.5],
  ]) {
    expect(at(occupied.board, x + 0.3, y)).toBeLessThan(at(blank.board, x + 0.3, y));
    expect(at(occupied.board, x + 0.55, y)).toBeLessThan(at(blank.board, x + 0.55, y));
  }
  // No vertical flip, wrapping into opposite edges, or darkening of unrelated empty cells.
  for (const [x, y] of [
    [2.8, 5.5],
    [8.8, 2.5],
    [5.3, 4.5],
    [0, 0],
    [11, 8],
  ])
    expect(at(occupied.board, x, y)).toBe(at(blank.board, x, y));
  expect(at(occupied.board, 0.5, 0.5)).toBeLessThan(255);
  expect(at(occupied.board, 0, 0)).toBe(255);
  for (const maps of [blank, occupied]) {
    maps.local.dispose();
    maps.board.dispose();
  }
});

it.each([
  [1, 1],
  [1, 17],
  [17, 1],
  [50, 50],
  [252, 252],
  [256, 256],
])("bounds full %i×%i fields and prevents accumulated darkness", (width, height) => {
  const maps = createPreviewOcclusion(
    Array.from({ length: height }, () => Array<string>(width).fill("H2")),
  );
  expect(maps.board.image.width).toBeLessThanOrEqual(2048);
  expect(maps.board.image.height).toBeLessThanOrEqual(2048);
  expect(maps.board.image.data!.length).toBe(maps.board.image.width * maps.board.image.height);
  let minimum = 255;
  for (const value of maps.board.image.data!) minimum = Math.min(minimum, value);
  expect(minimum).toBeGreaterThanOrEqual(153);
  expect(minimum).toBeLessThan(200);
  expect(sample(maps.board, 0, 0)).toBe(255);
  if (width === 256) expect(maps.board.image.width).toBe(1820);
  maps.local.dispose();
  maps.board.dispose();
});

it("gives board markings the same receiver coordinates and releases both shared textures", () => {
  const model = createPegboardScene([
    ["H2", null, "H7"],
    [null, "F13", null],
  ]);
  expect(model.guides.material.aoMap).toBe(model.board.material.aoMap);
  expect(model.guides.material.isMeshStandardMaterial).toBe(true);
  expect(model.guides.material.toneMapped).toBe(true);
  const field = model.board.material.aoMap as DataTexture;
  expect(field.colorSpace).toBe(NoColorSpace);
  expect(field.channel).toBe(1);
  for (const mesh of [model.board, model.guides]) {
    const positions = mesh.geometry.getAttribute("position");
    const normals = mesh.geometry.getAttribute("normal");
    const uv = mesh.geometry.getAttribute("uv1");
    for (let i = 0; i < positions.count; i++) {
      if (normals.getY(i) > 0.5) {
        expect((uv.getX(i) - 0.5) * model.width).toBeCloseTo(positions.getX(i), 5);
        expect((uv.getY(i) - 0.5) * model.depth).toBeCloseTo(positions.getZ(i), 5);
      } else expect([uv.getX(i), uv.getY(i)]).toEqual([0, 0]);
    }
  }
  const disposed = vi.fn();
  field.addEventListener("dispose", disposed);
  model.beads.material.aoMap!.addEventListener("dispose", disposed);
  model.dispose();
  expect(disposed).toHaveBeenCalledTimes(2);
});

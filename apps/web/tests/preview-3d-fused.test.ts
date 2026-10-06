import { expect, it, vi } from "vitest";
import { Color, Raycaster, Vector3 } from "three";
import { defaultPalette } from "@my-beads/core";
import { createFusedPreview, fusedShape } from "../src/preview-3d-fused.js";
import { createPegboardScene } from "../src/preview-3d-renderer.js";

function ray(model: ReturnType<typeof createFusedPreview>, x: number, z: number, below = false) {
  return new Raycaster(
    new Vector3(x, below ? -1 : 1, z),
    new Vector3(0, below ? 1 : -1, 0),
  ).intersectObjects(model.meshes);
}

/** Weld positions for topology inspection, retaining opposite directed edge incidence. */
function expectClosed(model: ReturnType<typeof createFusedPreview>) {
  const edges = new Map<string, { count: number; direction: number }>();
  const degenerate: string[] = [];
  const collapsed: number[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (const mesh of model.meshes) {
    const p = mesh.geometry.getAttribute("position");
    const keys = Array.from({ length: p.count }, (_, i) =>
      [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(5)).join(","),
    );
    const indices = mesh.geometry.index!.array;
    for (let i = 0; i < indices.length; i += 3) {
      a.fromBufferAttribute(p, indices[i]);
      b.fromBufferAttribute(p, indices[i + 1]);
      c.fromBufferAttribute(p, indices[i + 2]);
      if (b.sub(a).cross(c.sub(a)).lengthSq() < 1e-12) collapsed.push(i);
      for (let edge = 0; edge < 3; edge++) {
        const a = keys[indices[i + edge]];
        const b = keys[indices[i + ((edge + 1) % 3)]];
        if (a === b) degenerate.push(a);
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        const entry = edges.get(key) ?? { count: 0, direction: 0 };
        entry.count++;
        entry.direction += a < b ? 1 : -1;
        edges.set(key, entry);
      }
    }
  }
  expect(degenerate).toEqual([]);
  expect(collapsed).toEqual([]);
  expect(
    [...edges.entries()].filter(([, edge]) => edge.count !== 2 || edge.direction !== 0),
  ).toEqual([]);
}

it("caps every local neighborhood without cracks, interior walls or diagonal bridges", () => {
  const offsets = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  for (let mask = 0; mask < 256; mask++) {
    const grid = Array.from({ length: 3 }, () => Array<string | null>(3).fill(null));
    grid[1][1] = "H2";
    offsets.forEach(([x, z], index) => {
      if (mask & (1 << index)) grid[1 + z][1 + x] = "B15";
    });
    const model = createFusedPreview(grid);
    expectClosed(model);
    expect(ray(model, 0, 0)).not.toHaveLength(0);
    expect(ray(model, 0, 0, true)).not.toHaveLength(0);
    for (const mesh of model.meshes) {
      const normals = mesh.geometry.getAttribute("normal");
      const lengths = Array.from({ length: normals.count }, (_, i) =>
        Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)),
      );
      expect(
        lengths.filter((length) => !Number.isFinite(length) || Math.abs(length - 1) > 1e-6),
      ).toEqual([]);
    }
    model.dispose();
  }
  const diagonal = createFusedPreview([
    ["H2", null],
    [null, "H7"],
  ]);
  expect(ray(diagonal, 0, 0)).toHaveLength(0);
  diagonal.dispose();
});

it("closes filled intersections while retaining deliberate cutouts and exact palette colors", () => {
  const full = createFusedPreview([
    ["H2", "H7"],
    ["B15", "D22"],
  ]);
  for (const x of [-0.5, -0.001, 0, 0.001, 0.5])
    for (const z of [-0.5, -0.001, 0, 0.001, 0.5])
      expect(ray(full, x, z).length).toBeGreaterThan(0);
  const palette = new Set(["H2", "H7", "B15", "D22"].map((code) => defaultPalette.colors[code]));
  const c = new Color();
  for (const mesh of full.meshes) {
    const colors = mesh.geometry.getAttribute("color");
    const index = mesh.geometry.index!.array;
    for (let i = 0; i < index.length; i += 3) {
      const values = [...index.slice(i, i + 3)].map((v) => {
        c.setRGB(colors.getX(v), colors.getY(v), colors.getZ(v));
        return `#${c.getHexString().toUpperCase()}`;
      });
      expect(new Set(values).size).toBe(1);
      expect(palette.has(values[0])).toBe(true);
    }
    expect(mesh.material.aoMap).toBeNull();
  }
  full.dispose();
  const ring = createFusedPreview([
    ["H2", "H2", "H2"],
    ["H2", null, "H2"],
    ["H2", "H2", "H2"],
  ]);
  // Melted rims may overhang the cell border, but deliberate openings stay open.
  for (const x of [-0.4, 0, 0.4])
    for (const z of [-0.4, 0, 0.4]) expect(ray(ring, x, z)).toHaveLength(0);
  expectClosed(ring);
  ring.dispose();
});

it("spreads round exposed beads and bends shared color boundaries without moving their centers", () => {
  const single = createFusedPreview([["H2"]]);
  expect(single.bounds.min.x).toBeLessThan(-0.71);
  expect(single.bounds.max.x).toBeGreaterThan(0.71);
  expect(ray(single, 0.7, 0)).not.toHaveLength(0);
  expect(ray(single, 0.58, 0.58)).toHaveLength(0);
  expect(ray(single, 0, 0)[0].point.y).toBeCloseTo(fusedShape.height);
  expectClosed(single);
  single.dispose();

  const full = createFusedPreview(Array.from({ length: 3 }, () => ["H2", "H2", "H7", "H7"]));
  const c = new Color();
  const hitColor = (x: number, z: number) => {
    const hit = ray(full, x, z)[0];
    expect(hit).toBeDefined();
    const colors = full.meshes[0].geometry.getAttribute("color");
    c.fromBufferAttribute(colors, hit.face!.a);
    return `#${c.getHexString().toUpperCase()}`;
  };
  // Both samples would lie in the opposite color if the contact were a straight grid edge.
  expect(hitColor(-0.01, 0.25)).toBe(defaultPalette.colors.H7);
  expect(hitColor(0.01, -0.25)).toBe(defaultPalette.colors.H2);
  expect(hitColor(-0.5, 0)).toBe(defaultPalette.colors.H2);
  expect(hitColor(0.5, 0)).toBe(defaultPalette.colors.H7);
  expectClosed(full);
  full.dispose();
});

it("expands into free space while retaining constrained contacts and diagonal gaps", () => {
  const isolated = createFusedPreview([
    [null, null, null],
    [null, "H2", null],
    [null, null, null],
  ]);
  expect(ray(isolated, 0.48, 0.48)).not.toHaveLength(0);
  isolated.dispose();

  const diagonal = createFusedPreview([
    [null, null, null],
    [null, "H2", null],
    [null, null, "H7"],
  ]);
  expect(ray(diagonal, 0.42, 0.42)).toHaveLength(0);
  expect(ray(diagonal, 0.5, 0.5)).toHaveLength(0);
  expect(ray(diagonal, -0.7, 0)).not.toHaveLength(0);
  expectClosed(diagonal);
  diagonal.dispose();

  const pair = createFusedPreview([["H2", "H7"]]);
  // The free end reaches farther, while the neighbor contact retains its narrow neck.
  expect(ray(pair, -1.2, 0)).not.toHaveLength(0);
  expect(ray(pair, 0, 0.2)).not.toHaveLength(0);
  expect(ray(pair, 0, 0.4)).toHaveLength(0);
  expectClosed(pair);
  pair.dispose();

  const separated = createFusedPreview([["H2", null, "H7"]]);
  expect(ray(separated, -0.3, 0)).not.toHaveLength(0);
  expect(ray(separated, 0.3, 0)).not.toHaveLength(0);
  for (const x of [-0.15, 0, 0.15]) expect(ray(separated, x, 0)).toHaveLength(0);
  expectClosed(separated);
  separated.dispose();
});

it("joins regions exactly, supports narrow/blank grids and contains every generated vertex", () => {
  for (const grid of [
    [Array<string>(130).fill("H2")],
    Array.from({ length: 130 }, () => ["H7"]),
    Array.from({ length: 2 }, () => Array<string>(65).fill("B15")),
    [[null, null]],
  ]) {
    const model = createFusedPreview(grid);
    expectClosed(model);
    const point = new Vector3();
    for (const mesh of model.meshes) {
      const p = mesh.geometry.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        point.fromBufferAttribute(p, i);
        expect(model.bounds.containsPoint(point)).toBe(true);
        expect(mesh.geometry.boundingSphere!.containsPoint(point)).toBe(true);
      }
    }
    model.dispose();
  }
});

it("bounds maximum full and checkerboard geometry without dropping cells", () => {
  for (const checker of [false, true]) {
    const grid = Array.from({ length: 256 }, (_, y) =>
      Array.from({ length: 256 }, (_, x) => (checker && (x + y) % 2 ? null : "H2")),
    );
    const model = createFusedPreview(grid);
    let bytes = 0;
    let triangles = 0;
    let centers = 0;
    for (const mesh of model.meshes) {
      triangles += mesh.geometry.index!.count / 3;
      bytes += mesh.geometry.index!.array.byteLength;
      for (const attr of Object.values(mesh.geometry.attributes)) bytes += attr.array.byteLength;
      const positions = mesh.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++)
        if (
          Math.abs(positions.getY(i) - fusedShape.height) < 1e-6 &&
          Number.isInteger(positions.getX(i) + 0.5) &&
          Number.isInteger(positions.getZ(i) + 0.5)
        )
          centers++;
    }
    expect(centers).toBe(checker ? 32768 : 65536);
    expect(model.meshes).toHaveLength(16);
    expect(triangles).toBeLessThan(4_000_000);
    expect(bytes).toBeLessThan(100 * 1024 * 1024);
    model.dispose();
  }
});

it("constructs once, excludes board surfaces in fused mode and disposes the added resources", () => {
  const model = createPegboardScene([[null, "H2", null]]);
  expect(model.fused).toBeUndefined();
  model.key.castShadow = true;
  expect(model.setMode("fused")).toBe(true);
  const fused = model.fused!;
  expect(fused.meshes[0].castShadow).toBe(true);
  const disposed = vi.fn();
  fused.meshes[0].geometry.addEventListener("dispose", disposed);
  fused.meshes[0].material.addEventListener("dispose", disposed);
  for (const mesh of [model.board, model.guides, ...model.beads, ...model.pegs])
    expect(mesh.visible).toBe(false);
  expect(model.bounds).toBe(fused.bounds);
  for (let i = 0; i < 3; i++) {
    model.setMode("board");
    expect(fused.meshes[0].visible).toBe(false);
    model.setMode("fused");
    expect(model.fused).toBe(fused);
  }
  model.dispose();
  expect(disposed).toHaveBeenCalledTimes(2);
});

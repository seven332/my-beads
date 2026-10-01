import { describe, expect, it, vi } from "vitest";
import { DirectionalLight, Vector3, type WebGLRenderer, WebGLRenderTarget } from "three";
import { fitShadow, createPreviewShadows } from "../src/preview-3d-shadows.js";
import { createPegboardScene } from "../src/preview-3d-renderer.js";

describe("directional shadow coverage", () => {
  it.each([
    [54, 54],
    [260, 260],
    [5, 260],
    [260, 5],
  ])("covers all board and caster corners for %i×%i pitches", (width, depth) => {
    const key = new DirectionalLight();
    const coverage = fitShadow(key, width, depth, 2048);
    for (const x of [-width / 2, width / 2])
      for (const y of [-0.24, 0.82])
        for (const z of [-depth / 2, depth / 2]) {
          const point = new Vector3(x, y, z).project(key.shadow.camera);
          expect(Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z))).toBeLessThan(1);
        }
    expect(key.shadow.camera.near).toBeGreaterThan(0);
    expect(coverage.texelsPerPitch).toBeGreaterThan(0);
    expect(
      key.position
        .clone()
        .normalize()
        .distanceTo(new Vector3(-3, 7, 5).normalize()),
    ).toBeLessThan(1e-12);
  });
  it("reports the actual density limit instead of assuming maximum boards retain small detail", () => {
    const key = new DirectionalLight();
    expect(fitShadow(key, 54, 54, 2048).texelsPerPitch).toBeGreaterThan(16);
    expect(fitShadow(key, 260, 260, 2048).texelsPerPitch).toBeLessThan(6);
  });
});

it.each([
  [20, 20, 2048, true],
  [88, 88, 2048, true],
  [89, 89, 2048, false],
  [100, 100, 2048, false],
  [17, 100, 2048, true],
  [50, 50, 1024, false],
  [20, 20, 1024, true],
])(
  "bounds shadows for a %i×%i pattern and %i hardware limit",
  (width, height, maxTextureSize, available) => {
    const model = createPegboardScene(
      Array.from({ length: height }, () => Array<string>(width).fill("H2")),
    );
    const renderer = {
      capabilities: { maxTextureSize },
      shadowMap: { enabled: false, autoUpdate: true, needsUpdate: false },
    } as unknown as WebGLRenderer;
    const shadows = createPreviewShadows(renderer, model);
    expect(shadows.available).toBe(available);
    shadows.setEnabled(true);
    expect(renderer.shadowMap.enabled).toBe(available);
    const key = model.scene.children.find((child) => child instanceof DirectionalLight)!;
    if (available) {
      key.shadow.map = new WebGLRenderTarget();
      const dispose = vi.spyOn(key.shadow.map, "dispose");
      renderer.shadowMap.needsUpdate = false;
      shadows.invalidate();
      expect(renderer.shadowMap.needsUpdate).toBe(true);
      shadows.setEnabled(false);
      expect(dispose).toHaveBeenCalledOnce();
      expect(key.shadow.map).toBeNull();
      expect(model.guides.receiveShadow).toBe(false);
      expect(model.beads.every((mesh) => !mesh.castShadow && !mesh.receiveShadow)).toBe(true);
      renderer.shadowMap.needsUpdate = false;
      shadows.invalidate();
      expect(renderer.shadowMap.needsUpdate).toBe(false);
    }
    shadows.dispose();
    shadows.dispose();
    model.dispose();
  },
);

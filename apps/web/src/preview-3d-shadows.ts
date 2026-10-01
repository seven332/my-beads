import { Box3, DirectionalLight, PCFShadowMap, Vector3, type WebGLRenderer } from "three";
import type { createPegboardScene } from "./preview-3d-renderer.js";
import { beadShape } from "./preview-3d-data.js";

/** Full-board coverage stays independent of main-camera visibility. */
export function fitShadow(
  light: DirectionalLight,
  width: number,
  depth: number,
  size: 1024 | 2048,
) {
  light.position
    .set(-3, 7, 5)
    .normalize()
    .multiplyScalar(Math.hypot(width, depth) + 4);
  light.target.position.set(0, 0, 0);
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  const camera = light.shadow.camera;
  camera.position.copy(light.position);
  camera.lookAt(light.target.position);
  camera.updateMatrixWorld();
  const bounds = new Box3();
  for (const x of [-width / 2, width / 2])
    for (const y of [-0.24, beadShape.height])
      for (const z of [-depth / 2, depth / 2])
        bounds.expandByPoint(new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
  // Include filter coverage at all board edges, with a fixed world-space margin.
  camera.left = bounds.min.x - 0.5;
  camera.right = bounds.max.x + 0.5;
  camera.bottom = bounds.min.y - 0.5;
  camera.top = bounds.max.y + 0.5;
  camera.near = -bounds.max.z - 0.5;
  camera.far = -bounds.min.z + 0.5;
  camera.updateProjectionMatrix();
  light.shadow.mapSize.set(size, size);
  light.shadow.bias = -0.002 / (camera.far - camera.near);
  light.shadow.normalBias = 0.015;
  light.shadow.radius = 1;
  light.shadow.autoUpdate = false;
  light.shadow.needsUpdate = true;
  return {
    size,
    span: { x: camera.right - camera.left, y: camera.top - camera.bottom },
    texelsPerPitch: Math.min(
      size / (camera.right - camera.left),
      size / (camera.top - camera.bottom),
    ),
  };
}

/** One optional cached map, with explicit target ownership and no idle rendering. */
export function createPreviewShadows(
  renderer: WebGLRenderer,
  model: ReturnType<typeof createPegboardScene>,
) {
  const { key } = model;
  const coverage = fitShadow(key, model.width, model.depth, 2048);
  const span = Math.max(coverage.span.x, coverage.span.y);
  const size = span * 16 <= 1024 ? 1024 : 2048;
  const available = span * 16 <= size && size <= renderer.capabilities.maxTextureSize;
  key.shadow.mapSize.set(size, size);
  model.scene.add(key.target);
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const surfaces = [...model.beads, ...model.pegs, model.board, model.guides];
  let enabled = false;
  let disposed = false;

  function releaseMap() {
    key.shadow.dispose();
    key.shadow.map = null;
    key.shadow.mapPass = null;
  }
  return {
    available,
    setEnabled(value: boolean) {
      if (disposed || value === enabled || (value && !available)) return;
      enabled = value;
      renderer.shadowMap.enabled = value;
      key.castShadow = value;
      for (const mesh of [...model.beads, ...model.pegs]) mesh.castShadow = value;
      for (const mesh of surfaces) mesh.receiveShadow = value;
      if (value) {
        renderer.shadowMap.needsUpdate = true;
        key.shadow.needsUpdate = true;
      } else releaseMap();
    },
    invalidate() {
      if (!enabled || disposed) return;
      renderer.shadowMap.needsUpdate = true;
      key.shadow.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseMap();
    },
  };
}

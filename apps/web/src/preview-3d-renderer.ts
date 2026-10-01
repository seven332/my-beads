import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Sphere,
  type Texture,
  Vector3,
  WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createPreviewEnvironment } from "./preview-3d-environment.js";
import { createPreviewOcclusion, setBoardOcclusionUV } from "./preview-3d-occlusion.js";
import {
  createPreviewGeometries,
  projectedPitch,
  selectPreviewDetail,
  type PreviewDetail,
} from "./preview-3d-detail.js";
import type { PatternGrid } from "@my-beads/core";
import type { Theme } from "./theme-preference.js";
import type { PreviewAction } from "./preview-3d-controller.js";
import type { PreviewStatus } from "./preview-3d-state.js";
import {
  beadShape,
  pegPosition,
  pegboardLayout,
  previewBuffer,
  previewData,
} from "./preview-3d-data.js";

/** One mesh keeps physical stroke widths without WebGL's one-pixel line limitation. */
function guideGeometry(
  boardWidth: number,
  boardDepth: number,
  guides: ReturnType<typeof pegboardLayout>["guides"],
) {
  const positions: number[] = [];
  const halfWidth = 0.02;
  for (const { from, to, dashed } of guides) {
    const vertical = from.x === to.x;
    const length = vertical ? to.z - from.z : to.x - from.x;
    for (let start = 0; start < length; start += dashed ? 1 : length) {
      const end = Math.min(length, start + (dashed ? 0.6 : length));
      // Extend through the spare peg rows, clipping only at the slab's outer edges.
      const left = Math.max(-boardWidth / 2, from.x + (vertical ? -halfWidth : start));
      const right = Math.min(boardWidth / 2, from.x + (vertical ? halfWidth : end));
      const top = Math.max(-boardDepth / 2, from.z + (vertical ? start : -halfWidth));
      const bottom = Math.min(boardDepth / 2, from.z + (vertical ? end : halfWidth));
      // Counterclockwise from above: both triangles face the camera's allowed hemisphere.
      positions.push(left, 0, top, left, 0, bottom, right, 0, bottom);
      positions.push(left, 0, top, right, 0, bottom, right, 0, top);
    }
  }
  const geometry = new BufferGeometry().setAttribute(
    "position",
    new Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

/** CPU scene construction is separate from WebGL so placement/resources can be tested directly. */
export function createPegboardScene(grid: PatternGrid, environment: Texture | null = null) {
  const data = previewData(grid);
  const layout = pegboardLayout(data.width, data.height);
  const occlusion = createPreviewOcclusion(grid);
  const scene = new Scene();
  scene.environment = environment;
  scene.environmentIntensity = 0.35;
  const { height, pegRadius, pegHeight } = beadShape;
  const geometries = createPreviewGeometries();
  let detail: PreviewDetail | undefined;
  const beadMaterial = new MeshStandardMaterial({
    roughness: 0.48,
    metalness: 0,
    aoMap: occlusion.local,
  });
  const beads = new InstancedMesh(geometries.beads.get(6)!, beadMaterial, data.beads.length);
  const transform = new Matrix4();
  const color = new Color();
  data.beads.forEach((bead, index) => {
    beads.setMatrixAt(index, transform.makeTranslation(bead.x, 0, bead.z));
    beads.setColorAt(index, color.set(bead.color));
  });
  beads.instanceMatrix.needsUpdate = true;
  if (beads.instanceColor) beads.instanceColor.needsUpdate = true;

  const pegMaterial = new MeshStandardMaterial({
    color: "#dad9cc",
    roughness: 0.8,
    aoMap: occlusion.local,
  });
  const boardMaterial = new MeshStandardMaterial({
    color: "#dad9cc",
    roughness: 0.8,
    aoMap: occlusion.board,
  });
  // The two-cell margin is part of the peg lattice; content pegs start at board index (2, 2).
  const pegs = new InstancedMesh(geometries.pegs.get(4)!, pegMaterial, layout.width * layout.depth);
  for (let row = 0; row < layout.depth; row++)
    for (let column = 0; column < layout.width; column++) {
      const { x, z } = pegPosition(column, row, layout.width, layout.depth);
      pegs.setMatrixAt(row * layout.width + column, transform.makeTranslation(x, pegHeight / 2, z));
    }
  pegs.instanceMatrix.needsUpdate = true;
  // Every variant fits these bounds; changing detail never scans or omits instances.
  for (const [mesh, width, depth, radius, top] of [
    [beads, data.width, data.height, beadShape.radius, height],
    [pegs, layout.width, layout.depth, pegRadius, pegHeight],
  ] as const) {
    mesh.boundingBox = new Box3(
      new Vector3(-(width - 1) / 2 - radius, 0, -(depth - 1) / 2 - radius),
      new Vector3((width - 1) / 2 + radius, top, (depth - 1) / 2 + radius),
    );
    mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new Sphere());
  }
  const boardGeometry = new BoxGeometry(layout.width, 0.24, layout.depth);
  setBoardOcclusionUV(boardGeometry, layout.width, layout.depth);
  const board = new Mesh(boardGeometry, boardMaterial);
  board.position.y = -0.12;
  const gridGeometry = guideGeometry(layout.width, layout.depth, layout.guides);
  setBoardOcclusionUV(gridGeometry, layout.width, layout.depth);
  const gridMaterial = new MeshStandardMaterial({
    color: "#8b917b",
    roughness: 0.8,
    aoMap: occlusion.board,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const guides = new Mesh(gridGeometry, gridMaterial);
  guides.position.y = 0.002;
  scene.add(board, guides, pegs, beads);
  if (!environment) scene.add(new HemisphereLight("#ffffff", "#696657", 2.1));
  const key = new DirectionalLight("#ffffff", environment ? 1.3 : 2.7);
  key.position.set(-3, 7, 5);
  scene.add(key);
  const fill = new DirectionalLight("#ffffff", environment ? 0.25 : 0.8);
  fill.position.set(4, 3, -5);
  scene.add(fill);
  const fixedTriangles =
    boardGeometry.index!.count / 3 + gridGeometry.getAttribute("position").count / 3;
  return {
    scene,
    beads,
    pegs,
    board,
    guides,
    width: layout.width,
    depth: layout.depth,
    /** Returns true only when geometry changes; future shadow caches must then invalidate. */
    updateDetail(camera: PerspectiveCamera, bufferHeight: number) {
      const next = selectPreviewDetail(
        projectedPitch(camera, layout.width, layout.depth, bufferHeight),
        beads.count,
        pegs.count,
        fixedTriangles,
        detail,
      );
      const changed =
        beads.geometry !== geometries.beads.get(next.bead) ||
        pegs.geometry !== geometries.pegs.get(next.peg);
      beads.geometry = geometries.beads.get(next.bead)!;
      pegs.geometry = geometries.pegs.get(next.peg)!;
      detail = next;
      return changed;
    },
    dispose() {
      beads.dispose();
      pegs.dispose();
      geometries.dispose();
      boardGeometry.dispose();
      gridGeometry.dispose();
      beadMaterial.dispose();
      pegMaterial.dispose();
      boardMaterial.dispose();
      gridMaterial.dispose();
      occlusion.local.dispose();
      occlusion.board.dispose();
      scene.clear();
    },
  };
}

export function mountPreview3D(
  canvas: HTMLCanvasElement,
  grid: PatternGrid,
  initialTheme: Theme,
  report: (status: PreviewStatus) => void,
) {
  let renderer: WebGLRenderer | undefined;
  let environment: WebGLRenderTarget | null = null;
  let model: ReturnType<typeof createPegboardScene> | undefined;
  let controls: OrbitControls | undefined;
  let observer: ResizeObserver | undefined;
  let resolution: MediaQueryList | undefined;
  let frame = 0;
  let destroyed = false;
  let ready = false;
  let fitDistance = 1;
  const camera = new PerspectiveCamera(40, 1, 0.05, 4000);
  const direction = new Vector3(0.35, 0.95, 1.25).normalize();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    resolution?.removeEventListener("change", watchResolution);
    document.removeEventListener("visibilitychange", schedule);
    canvas.removeEventListener("webglcontextlost", lost);
    controls?.dispose();
    if (model) model.scene.environment = null;
    environment?.dispose();
    model?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  function fail() {
    if (destroyed) return;
    destroy();
    report("failed");
  }
  function lost(event: Event) {
    event.preventDefault();
    fail();
  }
  function schedule() {
    if (!frame && !destroyed && !document.hidden) frame = requestAnimationFrame(paint);
  }
  function paint() {
    frame = 0;
    if (destroyed || !model || !renderer || document.hidden) return;
    try {
      model.updateDetail(camera, canvas.height);
      renderer.render(model.scene, camera);
      if (renderer.getContext().isContextLost()) return fail();
      if (!ready) {
        ready = true;
        report("ready");
      }
    } catch {
      fail();
    }
  }
  function fit() {
    if (!model || !controls) return;
    controls.target.set(0, 0.25, 0);
    camera.position.copy(controls.target).add(direction);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    let distance = 0;
    for (const x of [-model.width / 2, model.width / 2])
      for (const z of [-model.depth / 2, model.depth / 2])
        for (const y of [-0.24, beadShape.height]) {
          const corner = new Vector3(x, y, z).sub(controls.target);
          distance = Math.max(
            distance,
            corner.dot(direction) +
              Math.max(
                Math.abs(corner.dot(up)) / tan,
                Math.abs(corner.dot(right)) / (tan * camera.aspect),
              ),
          );
        }
    fitDistance = distance * 1.12;
    controls.minDistance = Math.max(2, fitDistance / 30);
    controls.maxDistance = fitDistance * 3;
    camera.far = Math.max(100, fitDistance * 6);
    camera.updateProjectionMatrix();
    camera.position.copy(controls.target).addScaledVector(direction, fitDistance);
    controls.update();
    schedule();
  }
  function resize() {
    if (destroyed || !renderer) return;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const buffer = previewBuffer(width, height, window.devicePixelRatio);
    renderer.setSize(buffer.width, buffer.height, false);
    const oldAspect = camera.aspect;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (!ready || oldAspect !== camera.aspect) fit();
    schedule();
  }
  function watchResolution() {
    resolution?.removeEventListener("change", watchResolution);
    resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    resolution.addEventListener("change", watchResolution);
    resize();
  }
  function theme(value: Theme) {
    if (!model || destroyed) return;
    model.scene.background = new Color(value === "dark" ? "#1c231f" : "#e8ece4");
    schedule();
  }
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
    renderer.outputColorSpace = SRGBColorSpace;
    canvas.addEventListener("webglcontextlost", lost);
    environment = createPreviewEnvironment(renderer);
    // The direct-only fallback lacks the broad highlights needed by Neutral's dark curve.
    renderer.toneMapping = environment ? NeutralToneMapping : NoToneMapping;
    renderer.toneMappingExposure = environment ? 1.1 : 1;
    model = createPegboardScene(grid, environment?.texture);
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.maxTargetRadius = Math.hypot(model.width, model.depth);
    controls.addEventListener("change", schedule);
    observer = new ResizeObserver(resize);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", schedule);
    watchResolution();
    theme(initialTheme);
  } catch (error) {
    destroy();
    throw error;
  }
  return {
    theme,
    action(action: PreviewAction) {
      if (destroyed || !controls) return;
      if (action === "reset") return fit();
      const offset = camera.position.clone().sub(controls.target);
      if (action === "left" || action === "right")
        offset.applyAxisAngle(new Vector3(0, 1, 0), action === "left" ? -Math.PI / 8 : Math.PI / 8);
      else
        offset.setLength(
          Math.min(
            controls.maxDistance,
            Math.max(controls.minDistance, offset.length() * (action === "in" ? 0.8 : 1.25)),
          ),
        );
      camera.position.copy(controls.target).add(offset);
      controls.update();
      schedule();
    },
    destroy,
  };
}

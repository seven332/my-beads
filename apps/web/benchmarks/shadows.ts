/** Opt-in diagnostic only. The application entry never imports this module. */
import {
  Color,
  type DirectionalLight,
  Frustum,
  Matrix4,
  NeutralToneMapping,
  NoToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { parsePatternCsv } from "@my-beads/core";
import { createPegboardScene } from "../src/preview-3d-renderer.js";
import { createPreviewEnvironment } from "../src/preview-3d-environment.js";
import { fixture, type scenarios } from "./fixtures.js";
import { fitShadow } from "../src/preview-3d-shadows.js";

export interface ShadowOptions {
  scenario: (typeof scenarios)[number];
  size: 0 | 1024 | 2048;
  dark: boolean;
  failAllocation?: boolean;
}
export type ShadowView = "fit" | "near" | "top" | "oblique" | "panned";
export function createShadowStudy(options: ShadowOptions) {
  const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
  renderer.setSize(1198, 758, false);
  renderer.outputColorSpace = SRGBColorSpace;
  let environment: WebGLRenderTarget | null = null;
  let model: ReturnType<typeof createPegboardScene> | undefined;
  let key: DirectionalLight | undefined;
  let disposed = false;
  let shadowDraws = 0;
  let offscreenCasters = 0;
  let shadowUpdates = 0;
  const mainFrustum = new Frustum();
  const camera = new PerspectiveCamera(40, 1198 / 758, 0.05, 4000);
  const direction = new Vector3(0.35, 0.95, 1.25).normalize();
  let fitDistance = 1;

  function destroy() {
    if (disposed) return;
    disposed = true;
    key?.shadow.dispose();
    if (model) model.scene.environment = null;
    environment?.dispose();
    model?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  function view(name: ShadowView, angle = 0) {
    const target = new Vector3(name === "panned" ? model!.width * 0.28 : 0, 0.25, 0);
    const ray =
      name === "top"
        ? new Vector3(0, 1, 0.001).normalize()
        : name === "oblique"
          ? new Vector3(0.35, 0.25, 1.25).normalize()
          : direction.clone();
    ray.applyAxisAngle(new Vector3(0, 1, 0), angle);
    camera.position.copy(target).addScaledVector(ray, fitDistance * (name === "fit" ? 1 : 0.3));
    camera.lookAt(target);
    camera.updateMatrixWorld();
    mainFrustum.setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
  }
  try {
    environment = createPreviewEnvironment(renderer);
    renderer.toneMapping = environment ? NeutralToneMapping : NoToneMapping;
    renderer.toneMappingExposure = environment ? 1.1 : 1;
    model = createPegboardScene(parsePatternCsv(fixture(options.scenario)), environment?.texture);
    model.scene.background = new Color(options.dark ? "#1c231f" : "#e8ece4");
    key = model.key;
    const coverage = fitShadow(key, model.width, model.depth, options.size || 2048);
    if (options.size > renderer.capabilities.maxTextureSize)
      throw new Error("Requested map exceeds hardware limit");
    key.castShadow = options.size > 0;
    model.scene.add(key.target);
    renderer.shadowMap.enabled = options.size > 0;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = options.size > 0;
    for (const mesh of [...model.beads, ...model.pegs]) {
      mesh.castShadow = mesh.receiveShadow = options.size > 0;
      mesh.onBeforeShadow = () => {
        shadowDraws++;
        if (!mainFrustum.intersectsObject(mesh)) offscreenCasters++;
      };
    }
    model.board.receiveShadow = model.guides.receiveShadow = options.size > 0;
    // Match the production fit calculation before deliberately driving fixed diagnostic views.
    view("fit");
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    for (const x of [-model.width / 2, model.width / 2])
      for (const z of [-model.depth / 2, model.depth / 2])
        for (const y of [-0.24, 0.82]) {
          const corner = new Vector3(x, y - 0.25, z);
          fitDistance = Math.max(
            fitDistance,
            corner.dot(direction) +
              Math.max(
                Math.abs(corner.dot(up)) / tan,
                Math.abs(corner.dot(right)) / (tan * camera.aspect),
              ),
          );
        }
    fitDistance *= 1.12;
    view("fit");
    if (options.failAllocation) {
      const gl = renderer.getContext();
      const original = gl.framebufferTexture2D.bind(gl);
      gl.framebufferTexture2D = (...args) => {
        original(...args);
        if (args[1] === gl.DEPTH_ATTACHMENT) {
          gl.framebufferTexture2D = original;
          throw new Error("Injected shadow allocation failure");
        }
      };
    }
    return {
      coverage,
      destroy,
      background(dark: boolean) {
        model!.scene.background = new Color(dark ? "#1c231f" : "#e8ece4");
      },
      async render(name: ShadowView, angle = 0, force = false) {
        if (disposed) throw new Error("Study is disposed");
        view(name, angle);
        return new Promise<{
          cpuMs: number;
          changed: boolean;
          shadowDraws: number;
          offscreenCasters: number;
          shadowUpdates: number;
        }>((resolve, reject) => {
          requestAnimationFrame(() => {
            try {
              if (disposed) throw new Error("Study is disposed");
              const start = performance.now();
              const changed = model!.updateDetail(camera, canvas.height);
              if (options.size && (changed || force)) {
                renderer.shadowMap.needsUpdate = true;
                key!.shadow.needsUpdate = true;
              }
              shadowDraws = offscreenCasters = 0;
              renderer.render(model!.scene, camera);
              const cpuMs = performance.now() - start;
              if (renderer.getContext().isContextLost()) throw new Error("Context lost");
              if (shadowDraws) shadowUpdates++;
              resolve({ cpuMs, changed, shadowDraws, offscreenCasters, shadowUpdates });
            } catch (error) {
              destroy();
              reject(error);
            }
          });
        });
      },
    };
  } catch (error) {
    destroy();
    throw error;
  }
}
declare global {
  interface Window {
    createShadowStudy: typeof createShadowStudy;
    shadowStudy: ReturnType<typeof createShadowStudy>;
  }
}
window.createShadowStudy = createShadowStudy;

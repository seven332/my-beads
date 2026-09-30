import { InstancedMesh, PMREMGenerator, type WebGLRenderer } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/** One small environment per context; the caller owns the returned render target. */
export function createPreviewEnvironment(renderer: WebGLRenderer) {
  // WebGL2 alone does not guarantee renderable half-float textures used by PMREM.
  if (
    !renderer.extensions.has("EXT_color_buffer_float") &&
    !renderer.extensions.has("EXT_color_buffer_half_float")
  )
    return null;

  const room = new RoomEnvironment();
  const generator = new PMREMGenerator(renderer);
  try {
    // At roughness 0.48, 64px faces provide smooth highlights in a 336 x 256 atlas.
    return generator.fromScene(room, 0, 0.1, 100, { size: 64 });
  } finally {
    // RoomEnvironment.dispose() releases geometry/materials, but not instance buffers.
    room.traverse((object) => {
      if (object instanceof InstancedMesh) object.dispose();
    });
    room.dispose();
    generator.dispose();
  }
}

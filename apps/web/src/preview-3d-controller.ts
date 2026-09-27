import type { Theme } from "./theme-preference.js";
import type { PreviewSession, PreviewStatus } from "./preview-3d-state.js";
import type { mountPreview3D } from "./preview-3d-renderer.js";

export type PreviewAction = "left" | "right" | "in" | "out" | "reset";
export type PreviewLoader = () => Promise<{ mountPreview3D: typeof mountPreview3D }>;
interface Owner {
  id: number;
  canvas: HTMLCanvasElement;
  theme: Theme;
  renderer?: ReturnType<typeof mountPreview3D>;
}

/** Own the async module and GPU lifetime independently from the editor's Canvas 2D. */
export function createPreviewController(
  report: (id: number, status: PreviewStatus) => void,
  load: PreviewLoader = () => import("./preview-3d-renderer.js"),
) {
  let current: Owner | undefined;
  function release() {
    const previous = current;
    current = undefined;
    previous?.renderer?.destroy();
  }
  return {
    beforeRender(session: PreviewSession | null) {
      // OrbitControls removes keyboard listeners from canvas.getRootNode().
      // Release the old session while its canvas still belongs to the document.
      if (current?.id !== session?.id) release();
    },
    sync(canvas: HTMLCanvasElement | undefined, session: PreviewSession | null, theme: Theme) {
      if (current?.canvas !== canvas || current?.id !== session?.id) release();
      if (!canvas || !session) return;
      if (current) {
        if (current.theme !== theme) {
          current.theme = theme;
          current.renderer?.theme(theme);
        }
        return;
      }
      const owner: Owner = { id: session.id, canvas, theme };
      current = owner;
      function status(value: PreviewStatus) {
        // Also handles synchronous failures during mount without reentering render/watch.
        queueMicrotask(() => {
          if (current !== owner) return;
          if (value === "failed") {
            owner.renderer?.destroy();
            owner.renderer = undefined;
          }
          report(owner.id, value);
        });
      }
      Promise.resolve()
        .then(() => (current === owner ? load() : undefined))
        .then((module) => {
          if (current !== owner || !module) return;
          owner.renderer = module.mountPreview3D(canvas, session.grid, owner.theme, status);
        })
        .catch(() => status("failed"));
    },
    action(action: PreviewAction) {
      current?.renderer?.action(action);
    },
    destroy: release,
  };
}

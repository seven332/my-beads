/** Installed only by explicit benchmark/tests; never imported by application code. */
export interface ProbeFrame {
  context: number;
  phase: string;
  kind: "raf" | "task";
  startedAt: number;
  cpuMs: number;
  inputToSubmitMs: number | null;
  draws: number;
  triangles: number;
  viewports: { target: number; width: number; height: number }[];
  gpuMs: number | null;
  gpuStatus: "pending" | "available" | "unsupported" | "disjoint" | "lost" | "capacity";
}
export interface ProbeContext {
  id: number;
  renderer: string;
  vendor: string;
  timerSupported: boolean;
  lost: boolean;
  buffer: { width: number; height: number };
  resources: Record<
    string,
    { created: number; deleted: number; live: number; peak: number; reclaimed: number }
  >;
  allocations: { kind: string; width: number; height: number; depth: number }[];
}
export interface ProbeSnapshot {
  frames: ProbeFrame[];
  contexts: ProbeContext[];
  openings: { readyMs: number; context: number }[];
}
export interface PreviewProbe {
  phase(value: string): void;
  snapshot(): ProbeSnapshot;
}
declare global {
  interface Window {
    previewBenchmark: PreviewProbe;
  }
}

export function installPreviewProbe() {
  type Timer = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
  type Context = {
    gl: WebGL2RenderingContext;
    report: ProbeContext;
    handles: Map<string, Set<unknown>>;
    timer: Timer | null;
    pending: { query: WebGLQuery; frame: ProbeFrame }[];
    target: number;
  };
  type Scope = { start: number; kind: "raf" | "task"; frames: Map<Context, ProbeFrame> };
  const contexts = new Map<WebGL2RenderingContext, Context>();
  const ids = new WeakMap<object, number>();
  let nextId = 1;
  let phase = "startup";
  let scope: Scope | undefined;
  let opening: number | undefined;
  let inputAt: number | undefined;
  const frames: ProbeFrame[] = [];
  const openings: ProbeSnapshot["openings"] = [];
  const id = (value: unknown) => {
    if (!value || typeof value !== "object") return 0;
    if (!ids.has(value)) ids.set(value, nextId++);
    return ids.get(value)!;
  };
  function context(gl: WebGL2RenderingContext) {
    if (!(gl.canvas instanceof HTMLCanvasElement) || !gl.canvas.matches(".preview-canvas"))
      return undefined;
    let item = contexts.get(gl);
    if (item) return item;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2") as Timer | null;
    item = {
      gl,
      timer,
      handles: new Map(),
      pending: [],
      target: 0,
      report: {
        id: contexts.size + 1,
        renderer: String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)),
        vendor: String(gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR)),
        timerSupported: timer !== null,
        lost: false,
        buffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
        resources: {},
        allocations: [],
      },
    };
    contexts.set(gl, item);
    const owned = item;
    gl.canvas.addEventListener("webglcontextlost", () => {
      owned.report.lost = true;
      for (const { frame } of owned.pending) frame.gpuStatus = "lost";
      owned.pending.length = 0;
      for (const [kind, handles] of owned.handles) {
        owned.report.resources[kind].reclaimed += handles.size;
        handles.clear();
      }
    });
    return item;
  }
  function drain(item: Context) {
    const { gl, timer, pending } = item;
    if (!timer || item.report.lost) return;
    const disjoint = Boolean(gl.getParameter(timer.GPU_DISJOINT_EXT));
    for (let i = pending.length - 1; i >= 0; i--) {
      const { query, frame } = pending[i];
      if (disjoint || gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
        frame.gpuStatus = disjoint ? "disjoint" : "available";
        frame.gpuMs = disjoint ? null : Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1e6;
        gl.deleteQuery(query);
        pending.splice(i, 1);
      }
    }
  }
  function finish(current: Scope) {
    const elapsed = performance.now() - current.start;
    for (const [item, frame] of current.frames) {
      if (frame.gpuStatus === "pending" && !item.gl.isContextLost())
        item.gl.endQuery(item.timer!.TIME_ELAPSED_EXT);
      frame.cpuMs = elapsed;
      if (frame.draws > 0 && inputAt !== undefined) {
        frame.inputToSubmitMs = performance.now() - inputAt;
        inputAt = undefined;
      }
      frames.push(frame);
      if (frames.length > 10_000) throw new Error("Preview benchmark sample limit exceeded");
    }
  }
  function frameFor(item: Context) {
    if (!scope) {
      const task: Scope = { start: performance.now(), kind: "task", frames: new Map() };
      scope = task;
      queueMicrotask(() => {
        finish(task);
        if (scope === task) scope = undefined;
      });
    }
    let frame = scope.frames.get(item);
    if (!frame) {
      drain(item);
      frame = {
        context: item.report.id,
        phase,
        kind: scope.kind,
        startedAt: scope.start,
        cpuMs: 0,
        inputToSubmitMs: null,
        draws: 0,
        triangles: 0,
        viewports: [],
        gpuMs: null,
        gpuStatus: item.timer ? "capacity" : "unsupported",
      };
      if (item.timer && item.pending.length < 128 && !item.gl.isContextLost()) {
        const query = item.gl.createQuery();
        if (query) {
          item.gl.beginQuery(item.timer.TIME_ELAPSED_EXT, query);
          frame.gpuStatus = "pending";
          item.pending.push({ query, frame });
        }
      }
      scope.frames.set(item, frame);
    }
    return frame;
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((time) => {
      const previous = scope;
      const current: Scope = { start: performance.now(), kind: "raf", frames: new Map() };
      scope = current;
      try {
        callback(time);
      } finally {
        finish(current);
        scope = previous;
      }
    });

  // Native method interception is deliberately confined to this browser test boundary.
  type Native = (this: WebGL2RenderingContext, ...args: unknown[]) => unknown;
  function wrap(
    name: string,
    before?: (item: Context, args: unknown[]) => void,
    after?: (item: Context, args: unknown[], result: unknown) => void,
  ) {
    const proto = WebGL2RenderingContext.prototype;
    const original = Reflect.get(proto, name) as Native;
    Reflect.set(proto, name, function (this: WebGL2RenderingContext, ...args: unknown[]) {
      const item = context(this);
      if (item) before?.(item, args);
      const result = original.apply(this, args);
      if (item) after?.(item, args, result);
      return result;
    });
  }
  if (typeof WebGL2RenderingContext !== "undefined") {
    for (const [name, countIndex, instanceIndex] of [
      ["drawArrays", 2, -1],
      ["drawElements", 1, -1],
      ["drawArraysInstanced", 2, 3],
      ["drawElementsInstanced", 1, 4],
    ] as const)
      wrap(name, (item, args) => {
        const frame = frameFor(item);
        const count = Number(args[countIndex]);
        const instances = instanceIndex === -1 ? 1 : Number(args[instanceIndex]);
        frame.draws++;
        if (args[0] === item.gl.TRIANGLES) frame.triangles += Math.floor(count / 3) * instances;
        else if (args[0] === item.gl.TRIANGLE_STRIP || args[0] === item.gl.TRIANGLE_FAN)
          frame.triangles += Math.max(0, count - 2) * instances;
        item.report.buffer = {
          width: item.gl.drawingBufferWidth,
          height: item.gl.drawingBufferHeight,
        };
      });
    for (const kind of [
      "Buffer",
      "Texture",
      "Framebuffer",
      "Renderbuffer",
      "Program",
      "Shader",
      "VertexArray",
    ])
      for (const action of ["create", "delete"])
        wrap(action + kind, undefined, (item, args, result) => {
          const resource = action === "create" ? result : args[0];
          if (!resource) return;
          if (!item.handles.has(kind)) {
            item.handles.set(kind, new Set());
            item.report.resources[kind] = {
              created: 0,
              deleted: 0,
              live: 0,
              peak: 0,
              reclaimed: 0,
            };
          }
          const handles = item.handles.get(kind)!;
          if (action === "create") {
            handles.add(resource);
            item.report.resources[kind].created++;
            item.report.resources[kind].peak = Math.max(
              item.report.resources[kind].peak,
              handles.size,
            );
          } else if (handles.delete(resource)) item.report.resources[kind].deleted++;
        });
    wrap("bindFramebuffer", (item, args) => {
      if (args[0] !== item.gl.READ_FRAMEBUFFER) item.target = id(args[1]);
    });
    wrap("viewport", (item, args) => {
      // Viewport calls can precede the first draw: record them in the same callback scope.
      frameFor(item).viewports.push({
        target: item.target,
        width: Number(args[2]),
        height: Number(args[3]),
      });
    });
    for (const [name, width, height, depth] of [
      ["texStorage2D", 3, 4, -1],
      ["texStorage3D", 3, 4, 5],
      ["texImage2D", 3, 4, -1],
      ["texImage3D", 3, 4, 5],
      ["renderbufferStorage", 2, 3, -1],
      ["renderbufferStorageMultisample", 3, 4, -1],
    ] as const)
      wrap(name, undefined, (item, args) => {
        // Source-object texImage2D overloads have no numeric width/height arguments.
        if (name === "texImage2D" && args.length < 9) return;
        item.report.allocations.push({
          kind: name,
          width: Number(args[width]),
          height: Number(args[height]),
          depth: depth < 0 ? 1 : Number(args[depth]),
        });
      });
  }
  for (const event of ["pointermove", "pointerdown", "wheel"])
    document.addEventListener(
      event,
      (event) => {
        if (event.target instanceof Element && event.target.matches(".preview-canvas"))
          inputAt = performance.now();
      },
      { capture: true, passive: true },
    );
  document.addEventListener(
    "click",
    (event) => {
      if (event.target instanceof Element && event.target.closest(".preview-open"))
        opening = performance.now();
    },
    true,
  );
  new MutationObserver(() => {
    if (opening !== undefined && document.querySelector('.preview-stage[data-status="ready"]')) {
      openings.push({ readyMs: performance.now() - opening, context: contexts.size });
      opening = undefined;
    }
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-status"],
  });
  window.previewBenchmark = {
    phase(value) {
      phase = value;
    },
    snapshot() {
      for (const item of contexts.values()) {
        drain(item);
        for (const [kind, handles] of item.handles) item.report.resources[kind].live = handles.size;
      }
      return structuredClone({
        frames,
        openings,
        contexts: [...contexts.values()].map((item) => item.report),
      });
    },
  };
}

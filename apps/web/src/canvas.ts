import { defaultPalette, type Point } from "@my-beads/core";
import type { EditorModel } from "./state.js";

export interface CanvasActions {
  begin(point: Point): void; extend(point: Point): void; finish(cancel?: boolean): void;
  pan(dx: number, dy: number): void; zoom(factor: number, anchor: Point): void;
}
export function mountCanvas(canvas: HTMLCanvasElement, actions: CanvasActions) {
  const context = canvas.getContext("2d");
  let model: EditorModel | undefined;
  let frame = 0;
  let pointer: { id: number; x: number; y: number; pan: boolean } | undefined;
  let cursor: Point = { x: 0, y: 0 };
  let focused = false;
  let destroyed = false;
  function paint() {
    frame = 0;
    if (!model || !context || destroyed) return;
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const { zoom, x: left, y: top } = model.viewport;
    const grid = model.document.grid;
    const startX = Math.max(0, Math.floor(-left / zoom)), endX = Math.min(grid[0].length, Math.ceil((width - left) / zoom));
    const startY = Math.max(0, Math.floor(-top / zoom)), endY = Math.min(grid.length, Math.ceil((height - top) / zoom));
    for (let y = startY; y < endY; y++) for (let x = startX; x < endX; x++) {
      const code = grid[y][x];
      context.fillStyle = code ? defaultPalette.colors[code] : (x + y) % 2 ? "#e4e6e3" : "#f5f6f2";
      context.fillRect(left + x * zoom, top + y * zoom, zoom, zoom);
      if (model.gridVisible && zoom >= 6) {
        context.strokeStyle = "#64716440"; context.lineWidth = 0.5;
        context.strokeRect(left + x * zoom, top + y * zoom, zoom, zoom);
      }
      if (model.codesVisible && code && zoom >= 20) {
        const hex = defaultPalette.colors[code];
        const brightness = [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
        context.fillStyle = brightness > 420 ? "#202420" : "#ffffff";
        context.font = `600 ${Math.min(14, zoom * 0.3)}px -apple-system, BlinkMacSystemFont, sans-serif`;
        context.textAlign = "center"; context.textBaseline = "middle";
        context.fillText(code, left + (x + 0.5) * zoom, top + (y + 0.5) * zoom);
      }
    }
    if (focused) {
      context.strokeStyle = "#ef7540"; context.lineWidth = 2;
      context.strokeRect(left + cursor.x * zoom + 1, top + cursor.y * zoom + 1, zoom - 2, zoom - 2);
    }
  }
  function schedule() { if (!frame && !destroyed) frame = requestAnimationFrame(paint); }
  function position(event: PointerEvent | WheelEvent): Point {
    const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function cell(point: Point): Point {
    const view = model!.viewport;
    return { x: Math.floor((point.x - view.x) / view.zoom), y: Math.floor((point.y - view.y) / view.zoom) };
  }
  function down(event: PointerEvent) {
    if (!model || pointer || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault(); canvas.focus({ preventScroll: true });
    const p = position(event);
    pointer = { id: event.pointerId, ...p, pan: model.tool === "pan" || event.button === 1 };
    canvas.setPointerCapture(event.pointerId);
    if (!pointer.pan) { cursor = cell(p); actions.begin(cursor); }
  }
  function move(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId || !model) return;
    const p = position(event);
    if (pointer.pan) actions.pan(p.x - pointer.x, p.y - pointer.y);
    else { cursor = cell(p); actions.extend(cursor); }
    pointer = { ...pointer, ...p };
  }
  function end(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const active = pointer; pointer = undefined;
    if (!active.pan) actions.finish(event.type !== "pointerup");
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  function cancel() {
    const active = pointer; pointer = undefined;
    actions.finish(true);
    if (active && canvas.hasPointerCapture(active.id)) canvas.releasePointerCapture(active.id);
  }
  function wheel(event: WheelEvent) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) actions.zoom(Math.exp(-event.deltaY * 0.005), position(event));
    else actions.pan(-event.deltaX, -event.deltaY);
  }
  function key(event: KeyboardEvent) {
    if (!model) return;
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (delta) {
      event.preventDefault();
      if (event.shiftKey) actions.pan(-delta[0] * 30, -delta[1] * 30);
      else {
        cursor = { x: Math.max(0, Math.min(model.document.grid[0].length - 1, cursor.x + delta[0])),
          y: Math.max(0, Math.min(model.document.grid.length - 1, cursor.y + delta[1])) };
        schedule();
      }
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault(); actions.begin(cursor); actions.finish();
    } else if (event.key === "Escape") cancel();
  }
  function focus() { focused = true; schedule(); }
  function blur() { focused = false; cancel(); schedule(); }
  const observer = new ResizeObserver(schedule); observer.observe(canvas);
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("lostpointercapture", end); canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("keydown", key); canvas.addEventListener("focus", focus); canvas.addEventListener("blur", blur);
  window.addEventListener("blur", cancel);
  return {
    update(next: EditorModel) {
      model = next;
      cursor = { x: Math.max(0, Math.min(cursor.x, next.document.grid[0].length - 1)),
        y: Math.max(0, Math.min(cursor.y, next.document.grid.length - 1)) };
      schedule();
    },
    destroy() {
      destroyed = true; cancel(); cancelAnimationFrame(frame); observer.disconnect();
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", end); canvas.removeEventListener("pointercancel", end);
      canvas.removeEventListener("lostpointercapture", end); canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("keydown", key); canvas.removeEventListener("focus", focus); canvas.removeEventListener("blur", blur);
      window.removeEventListener("blur", cancel);
    },
  };
}

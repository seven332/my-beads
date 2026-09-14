import { defaultPalette, type Point } from "@my-beads/core";
import { canvasCursor } from "./canvas-cursor.js";
import { composing } from "./shortcuts.js";
import type { EditorModel } from "./state.js";
import type { CanvasTheme } from "./canvas-theme.js";

export interface CanvasActions {
  begin(point: Point): void;
  extend(point: Point): void;
  finish(cancel?: boolean): void;
  pan(dx: number, dy: number): void;
  zoom(factor: number, anchor: Point): void;
}
export function mountCanvas(canvas: HTMLCanvasElement, actions: CanvasActions) {
  const context = canvas.getContext("2d");
  let model: EditorModel | undefined;
  let theme: CanvasTheme;
  let frame = 0;
  let pointer: { id: number; x: number; y: number; pan: boolean } | undefined;
  let cursor: Point | null = null;
  let focused = false;
  let destroyed = false;
  let panHeld = false;
  function updateMouseCursor() {
    if (!model || destroyed) return;
    const tool = !pointer && panHeld ? "pan" : model.tool;
    const value = canvasCursor(tool, pointer?.pan ?? false);
    if (canvas.style.cursor !== value) canvas.style.cursor = value;
  }
  function paint() {
    frame = 0;
    if (!model || !context || destroyed) return;
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(width * dpr)),
      h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const { zoom, x: left, y: top } = model.viewport;
    const grid = model.document.grid;
    const startX = Math.max(0, Math.floor(-left / zoom)),
      endX = Math.min(grid[0].length, Math.ceil((width - left) / zoom));
    const startY = Math.max(0, Math.floor(-top / zoom)),
      endY = Math.min(grid.length, Math.ceil((height - top) / zoom));
    for (let y = startY; y < endY; y++)
      for (let x = startX; x < endX; x++) {
        const code = grid[y][x];
        context.fillStyle = code
          ? defaultPalette.colors[code]
          : (x + y) % 2
            ? theme.emptyB
            : theme.emptyA;
        context.fillRect(left + x * zoom, top + y * zoom, zoom, zoom);
        if (model.gridVisible && zoom >= 6) {
          context.strokeStyle = theme.grid;
          context.lineWidth = 0.5;
          context.strokeRect(left + x * zoom, top + y * zoom, zoom, zoom);
        }
        if (model.codesVisible && code && zoom >= 20) {
          const hex = defaultPalette.colors[code];
          const brightness = [1, 3, 5].reduce(
            (sum, i) => sum + parseInt(hex.slice(i, i + 2), 16),
            0,
          );
          context.fillStyle = brightness > 420 ? "#202420" : "#ffffff";
          context.font = `600 ${Math.min(14, zoom * 0.3)}px -apple-system, BlinkMacSystemFont, sans-serif`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(code, left + (x + 0.5) * zoom, top + (y + 0.5) * zoom);
        }
        if (model.highlightedColor && code !== model.highlightedColor) {
          context.fillStyle = theme.mask;
          context.fillRect(left + x * zoom, top + y * zoom, zoom, zoom);
        }
      }
    if (model.highlightedColor && zoom >= 3) {
      context.save();
      context.beginPath();
      const code = model.highlightedColor;
      // Read actual neighbors, even outside the viewport, so panning never invents edges.
      for (let y = startY; y < endY; y++)
        for (let x = startX; x < endX; x++) {
          if (grid[y][x] !== code) continue;
          const l = left + x * zoom,
            t = top + y * zoom,
            r = l + zoom,
            b = t + zoom;
          if (grid[y - 1]?.[x] !== code) {
            context.moveTo(l, t);
            context.lineTo(r, t);
          }
          if (grid[y + 1]?.[x] !== code) {
            context.moveTo(l, b);
            context.lineTo(r, b);
          }
          if (grid[y][x - 1] !== code) {
            context.moveTo(l, t);
            context.lineTo(l, b);
          }
          if (grid[y][x + 1] !== code) {
            context.moveTo(r, t);
            context.lineTo(r, b);
          }
        }
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = theme.outlineDark;
      context.lineWidth = Math.min(3, zoom * 0.45);
      context.stroke();
      context.strokeStyle = theme.outlineLight;
      context.lineWidth = Math.min(1, zoom * 0.15);
      context.stroke();
      context.restore();
    }
    if (focused && cursor) {
      context.strokeStyle = theme.selection;
      context.lineWidth = 2;
      context.strokeRect(left + cursor.x * zoom + 1, top + cursor.y * zoom + 1, zoom - 2, zoom - 2);
    }
  }
  function schedule() {
    if (!frame && !destroyed) frame = requestAnimationFrame(paint);
  }
  function insideGrid(point: Point) {
    return (
      !!model &&
      point.x >= 0 &&
      point.y >= 0 &&
      point.x < model.document.grid[0].length &&
      point.y < model.document.grid.length
    );
  }
  function setCursor(point: Point | null) {
    cursor = point && insideGrid(point) ? point : null;
    // Cursor movement is local; picking the same color may not update the store.
    schedule();
  }
  function position(event: PointerEvent | WheelEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function cell(point: Point): Point {
    const view = model!.viewport;
    return {
      x: Math.floor((point.x - view.x) / view.zoom),
      y: Math.floor((point.y - view.y) / view.zoom),
    };
  }
  function down(event: PointerEvent) {
    if (!model || pointer || (event.button !== 0 && event.button !== 1)) return;
    const p = position(event),
      pan =
        model.tool === "pan" || event.button === 1 || (panHeld && event.pointerType !== "touch");
    // Pointer focus must not create a keyboard cursor while panning or clicking outside the grid.
    const target = pan ? cursor : cell(p);
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    setCursor(target);
    if (!pan && !cursor) return;
    pointer = { id: event.pointerId, ...p, pan };
    updateMouseCursor();
    canvas.setPointerCapture(event.pointerId);
    if (!pan && cursor) actions.begin(cursor);
  }
  function move(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId || !model) return;
    const p = position(event);
    if (pointer.pan) actions.pan(p.x - pointer.x, p.y - pointer.y);
    else {
      const point = cell(p);
      setCursor(point);
      // Keep raw endpoints for clipping a stroke that began inside the grid.
      actions.extend(point);
    }
    pointer = { ...pointer, ...p };
  }
  function end(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const active = pointer;
    pointer = undefined;
    updateMouseCursor();
    // Chrome can report capture loss with released buttons before pointerup.
    const canceled =
      event.type === "pointercancel" ||
      (event.type === "lostpointercapture" && event.buttons !== 0);
    if (canceled) {
      panHeld = false;
      updateMouseCursor();
    }
    if (!active.pan) actions.finish(canceled);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  function cancel() {
    const active = pointer;
    pointer = undefined;
    panHeld = false;
    updateMouseCursor();
    actions.finish(true);
    if (active && canvas.hasPointerCapture(active.id)) canvas.releasePointerCapture(active.id);
  }
  function wheel(event: WheelEvent) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey)
      actions.zoom(Math.exp(-event.deltaY * 0.005), position(event));
    else actions.pan(-event.deltaX, -event.deltaY);
  }
  function key(event: KeyboardEvent) {
    if (
      !model ||
      event.defaultPrevented ||
      composing(event) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      (pointer && event.key !== "Escape")
    )
      return;
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
      event.key
    ];
    if (delta) {
      event.preventDefault();
      if (event.shiftKey) actions.pan(-delta[0] * 30, -delta[1] * 30);
      else {
        setCursor(
          cursor
            ? {
                x: Math.max(0, Math.min(model.document.grid[0].length - 1, cursor.x + delta[0])),
                y: Math.max(0, Math.min(model.document.grid.length - 1, cursor.y + delta[1])),
              }
            : { x: 0, y: 0 },
        );
      }
    } else if (event.key === "Enter" && !panHeld) {
      event.preventDefault();
      if (cursor) {
        actions.begin(cursor);
        actions.finish();
      }
    } else if (event.key === "Escape") cancel();
  }
  function focus() {
    focused = true;
    setCursor(cursor ?? { x: 0, y: 0 });
  }
  function blur() {
    focused = false;
    cancel();
    schedule();
  }
  function visibility() {
    if (document.hidden) cancel();
  }
  const observer = new ResizeObserver(schedule);
  observer.observe(canvas);
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("lostpointercapture", end);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("keydown", key);
  canvas.addEventListener("focus", focus);
  canvas.addEventListener("blur", blur);
  window.addEventListener("blur", cancel);
  document.addEventListener("visibilitychange", visibility);
  return {
    interacting() {
      return !!pointer;
    },
    holdPan(held: boolean) {
      panHeld = held;
      updateMouseCursor();
    },
    update(next: EditorModel, colors: CanvasTheme) {
      model = next;
      theme = colors;
      updateMouseCursor();
      setCursor(cursor);
    },
    destroy() {
      destroyed = true;
      cancel();
      canvas.style.removeProperty("cursor");
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointercancel", end);
      canvas.removeEventListener("lostpointercapture", end);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("keydown", key);
      canvas.removeEventListener("focus", focus);
      canvas.removeEventListener("blur", blur);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}

/** Own one saturation/brightness drag; native H/S/B fields provide keyboard input. */
export function mountColorArea(
  element: HTMLElement,
  hue: HTMLInputElement,
  pick: (saturation: number, brightness: number) => void,
) {
  let pointer: number | null = null;
  function update(event: PointerEvent) {
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    pick(
      Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100)),
      Math.max(0, Math.min(100, (1 - (event.clientY - box.top) / box.height) * 100)),
    );
  }
  function down(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0 || pointer !== null) return;
    event.preventDefault();
    // Keep keyboard input in the picker without moving the area under the pointer.
    hue.focus({ preventScroll: true });
    pointer = event.pointerId;
    element.setPointerCapture(pointer);
    update(event);
  }
  function move(event: PointerEvent) {
    if (event.pointerId === pointer) update(event);
  }
  function cancel() {
    const previous = pointer;
    pointer = null;
    if (previous !== null && element.hasPointerCapture(previous))
      element.releasePointerCapture(previous);
  }
  function end(event: PointerEvent) {
    if (event.pointerId !== pointer) return;
    if (event.type === "pointerup") update(event);
    cancel();
  }
  function visibility() {
    if (document.hidden) cancel();
  }
  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", end);
  element.addEventListener("pointercancel", end);
  element.addEventListener("lostpointercapture", end);
  window.addEventListener("blur", cancel);
  document.addEventListener("visibilitychange", visibility);
  return {
    destroy() {
      cancel();
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
      element.removeEventListener("lostpointercapture", end);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}

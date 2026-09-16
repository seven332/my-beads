import {
  composing,
  editable,
  matchShortcut,
  shortcutEntries,
  type ShortcutId,
} from "./shortcuts.js";

interface KeyboardActions {
  canvas(): HTMLCanvasElement | undefined;
  enabled(): boolean;
  interacting(): boolean;
  pan(held: boolean): void;
  run: Record<ShortcutId, () => void>;
}

/** Own keyboard routing separately from the Canvas pointer gesture and persisted tool. */
export function mountKeyboard(host: HTMLElement, actions: KeyboardActions) {
  let owned = false;
  let inComposition = false;
  let spaceHeld = false;
  let canvasIntent = false;
  function release() {
    spaceHeld = false;
    actions.pan(false);
  }
  function scope(event: Event) {
    owned = event.target instanceof Node && host.contains(event.target);
    if (event.target !== actions.canvas()) canvasIntent = false;
    if (!owned || editable(event.target)) release();
  }
  function claimPan() {
    const canvas = actions.canvas();
    if (!canvas || !spaceHeld || !actions.enabled() || inComposition || actions.interacting())
      return false;
    canvas.focus({ preventScroll: true });
    actions.pan(true);
    return true;
  }
  function point(event: PointerEvent) {
    if (
      event.pointerType === "touch" ||
      event.isPrimary === false ||
      (event.type === "pointermove" && event.buttons !== 0)
    )
      return;
    owned = event.target instanceof Node && host.contains(event.target);
    canvasIntent = event.target === actions.canvas();
    if (canvasIntent) claimPan();
    else if (!owned) release();
  }
  function pointerdown(event: PointerEvent) {
    scope(event);
    if (!event.defaultPrevented) point(event);
  }
  function focusout(event: FocusEvent) {
    if (event.target === actions.canvas()) {
      canvasIntent = false;
      release();
    }
  }
  function cancelPointer(event: PointerEvent) {
    if (
      event.target === actions.canvas() &&
      (event.type === "pointercancel" || event.buttons !== 0)
    )
      release();
  }
  function startComposition() {
    inComposition = true;
    canvasIntent = false;
    release();
  }
  function endComposition() {
    inComposition = false;
  }
  function blur() {
    owned = false;
    inComposition = false;
    canvasIntent = false;
    release();
  }
  function keyup(event: KeyboardEvent) {
    if (event.key === " " || event.code === "Space") release();
  }
  function trackSpace(event: KeyboardEvent) {
    if (event.key === "Escape") {
      release();
      return;
    }
    if (
      event.key !== " " ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      event.repeat ||
      event.defaultPrevented ||
      inComposition ||
      composing(event) ||
      !actions.enabled() ||
      !(
        (event.target instanceof Node && host.contains(event.target)) ||
        (event.target === document.body && owned)
      )
    )
      return;
    spaceHeld = true;
    // A fresh pointer return plus Space claims Canvas before a focused menu handles the key.
    // Focusing a control clears that intent, so a stationary pointer cannot steal typing.
    if (canvasIntent && claimPan()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  function keydown(event: KeyboardEvent) {
    const target = event.target;
    const inside = target instanceof Node && host.contains(target);
    if (
      !(inside || (target === document.body && owned)) ||
      !actions.enabled() ||
      event.defaultPrevented ||
      inComposition ||
      composing(event) ||
      editable(target)
    )
      return;
    if (event.key === " " && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      if (!event.repeat) actions.pan(true);
      // Space must still activate focused native controls. A subsequent Canvas drag may pan.
      if (!(target instanceof Element && target.closest("button, a[href], summary, [role=button]")))
        event.preventDefault();
      return;
    }
    const id = matchShortcut(event);
    if (!id || actions.interacting()) return;
    event.preventDefault();
    const shortcut = shortcutEntries.find(([key]) => key === id)![1];
    if (event.repeat && !shortcut.repeat) return;
    actions.run[id]();
  }
  function visibility() {
    if (document.hidden) blur();
  }
  window.addEventListener("keydown", keydown);
  window.addEventListener("keydown", trackSpace, true);
  window.addEventListener("keyup", keyup, true);
  window.addEventListener("pointerdown", pointerdown, true);
  window.addEventListener("pointermove", point, true);
  window.addEventListener("pointercancel", cancelPointer, true);
  window.addEventListener("lostpointercapture", cancelPointer, true);
  window.addEventListener("focusin", scope);
  window.addEventListener("focusout", focusout);
  window.addEventListener("blur", blur);
  window.addEventListener("compositionstart", startComposition);
  window.addEventListener("compositionend", endComposition);
  document.addEventListener("visibilitychange", visibility);
  return {
    sync() {
      if (!actions.enabled()) {
        canvasIntent = false;
        release();
      }
    },
    destroy() {
      release();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keydown", trackSpace, true);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("pointerdown", pointerdown, true);
      window.removeEventListener("pointermove", point, true);
      window.removeEventListener("pointercancel", cancelPointer, true);
      window.removeEventListener("lostpointercapture", cancelPointer, true);
      window.removeEventListener("focusin", scope);
      window.removeEventListener("focusout", focusout);
      window.removeEventListener("blur", blur);
      window.removeEventListener("compositionstart", startComposition);
      window.removeEventListener("compositionend", endComposition);
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}

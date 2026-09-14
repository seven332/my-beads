import {
  composing,
  editable,
  matchShortcut,
  shortcutEntries,
  type ShortcutId,
} from "./shortcuts.js";

interface KeyboardActions {
  enabled(): boolean;
  interacting(): boolean;
  pan(held: boolean): void;
  run: Record<ShortcutId, () => void>;
}

/** Own keyboard routing separately from the Canvas pointer gesture and persisted tool. */
export function mountKeyboard(host: HTMLElement, actions: KeyboardActions) {
  let owned = false;
  let inComposition = false;
  function release() {
    actions.pan(false);
  }
  function scope(event: Event) {
    owned = event.target instanceof Node && host.contains(event.target);
    if (!owned || editable(event.target)) release();
  }
  function startComposition() {
    inComposition = true;
    release();
  }
  function endComposition() {
    inComposition = false;
  }
  function blur() {
    owned = false;
    inComposition = false;
    release();
  }
  function keyup(event: KeyboardEvent) {
    if (event.key === " " || event.code === "Space") release();
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
  window.addEventListener("keyup", keyup);
  window.addEventListener("pointerdown", scope, true);
  window.addEventListener("focusin", scope);
  window.addEventListener("blur", blur);
  window.addEventListener("compositionstart", startComposition);
  window.addEventListener("compositionend", endComposition);
  document.addEventListener("visibilitychange", visibility);
  return {
    sync() {
      if (!actions.enabled()) release();
    },
    destroy() {
      release();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("pointerdown", scope, true);
      window.removeEventListener("focusin", scope);
      window.removeEventListener("blur", blur);
      window.removeEventListener("compositionstart", startComposition);
      window.removeEventListener("compositionend", endComposition);
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}

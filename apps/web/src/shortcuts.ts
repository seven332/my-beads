import type { Translate } from "./i18n/index.js";

interface Shortcut {
  keys: readonly string[];
  hint: string;
  aria: string;
  label(t: Translate): string;
  shift?: boolean;
  mod?: boolean;
  repeat?: boolean;
}

// One catalog supplies dispatch, translated help labels and toolbar hints.
export const shortcuts = {
  pencil: {
    keys: ["p"],
    hint: "P",
    aria: "p",
    shift: false,
    label: (t) => t(($) => $.tools.pencil),
  },
  eraser: {
    keys: ["e"],
    hint: "E",
    aria: "e",
    shift: false,
    label: (t) => t(($) => $.tools.eraser),
  },
  bucket: {
    keys: ["b"],
    hint: "B",
    aria: "b",
    shift: false,
    label: (t) => t(($) => $.tools.bucketLabel),
  },
  eyedropper: {
    keys: ["i"],
    hint: "I",
    aria: "i",
    shift: false,
    label: (t) => t(($) => $.tools.eyedropperLabel),
  },
  pan: { keys: ["h"], hint: "H", aria: "h", shift: false, label: (t) => t(($) => $.tools.pan) },
  grid: { keys: ["g"], hint: "G", aria: "g", shift: false, label: (t) => t(($) => $.app.grid) },
  codes: { keys: ["c"], hint: "C", aria: "c", shift: false, label: (t) => t(($) => $.app.codes) },
  zoomIn: {
    keys: ["+", "="],
    hint: "+",
    aria: "plus = Shift+=",
    repeat: true,
    label: (t) => t(($) => $.app.zoomIn),
  },
  zoomOut: {
    keys: ["-", "_"],
    hint: "−",
    aria: "-",
    repeat: true,
    label: (t) => t(($) => $.app.zoomOut),
  },
  fit: {
    keys: ["1", "!"],
    hint: "Shift + 1",
    aria: "Shift+1",
    shift: true,
    label: (t) => t(($) => $.app.fitWindow),
  },
  fitHighlight: {
    keys: ["2", "@"],
    hint: "Shift + 2",
    aria: "Shift+2",
    shift: true,
    label: (t) => t(($) => $.keyboard.fitHighlight),
  },
  help: { keys: ["?"], hint: "?", aria: "Shift+/", label: (t) => t(($) => $.keyboard.heading) },
  undo: {
    keys: ["z"],
    hint: "Ctrl / ⌘ + Z",
    aria: "Control+z Meta+z",
    mod: true,
    shift: false,
    repeat: true,
    label: (t) => t(($) => $.app.undo),
  },
  redo: {
    keys: ["z"],
    hint: "Ctrl / ⌘ + Shift + Z",
    aria: "Control+Shift+z Meta+Shift+z",
    mod: true,
    shift: true,
    repeat: true,
    label: (t) => t(($) => $.app.redo),
  },
} satisfies Record<string, Shortcut>;
export type ShortcutId = keyof typeof shortcuts;
export const shortcutEntries = Object.entries(shortcuts) as [ShortcutId, Shortcut][];

export function matchShortcut(event: KeyboardEvent): ShortcutId | undefined {
  if (event.altKey || (event.ctrlKey && event.metaKey)) return;
  return shortcutEntries.find(
    ([, shortcut]) =>
      !!shortcut.mod === (event.ctrlKey || event.metaKey) &&
      (shortcut.shift === undefined || shortcut.shift === event.shiftKey) &&
      shortcut.keys.includes(event.key.toLowerCase()),
  )?.[0];
}

export function shortcutHint(t: Translate, id: ShortcutId): string {
  const shortcut = shortcuts[id];
  return t(($) => $.keyboard.tooltip, { action: shortcut.label(t), shortcut: shortcut.hint });
}

export function composing(event: KeyboardEvent): boolean {
  // Some browsers report the final IME key with isComposing=false and keyCode=229.
  return event.isComposing || event.keyCode === 229;
}

export function editable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (!!target.closest("input, textarea, select") || target.isContentEditable)
  );
}

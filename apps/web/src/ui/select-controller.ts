import { composing } from "../shortcuts.js";

let nextId = 0;

/** One mount owns one open listbox; committed values still go through view change handlers. */
export function mountSelects(host: HTMLElement) {
  let menu: { root: HTMLElement; trigger: HTMLButtonElement; popup: HTMLElement } | undefined;
  let index = 0;
  let search = "";
  let typedAt = 0;
  let observer: ResizeObserver | undefined;
  const viewport = window.visualViewport;
  const items = () => [...(menu?.popup.querySelectorAll<HTMLElement>("[role=option]") ?? [])];

  function close() {
    if (!menu) return;
    const previous = menu;
    menu = undefined;
    previous.popup.removeEventListener("beforetoggle", toggle);
    observer?.disconnect();
    observer = undefined;
    window.removeEventListener("resize", position);
    window.removeEventListener("scroll", position, true);
    viewport?.removeEventListener("resize", position);
    viewport?.removeEventListener("scroll", position);
    previous.trigger.setAttribute("aria-expanded", "false");
    previous.trigger.removeAttribute("aria-activedescendant");
    previous.popup
      .querySelectorAll("[data-active]")
      .forEach((item) => item.removeAttribute("data-active"));
    if (previous.popup.isConnected) previous.popup.hidePopover();
    search = "";
  }

  function position() {
    if (!menu) return;
    const { trigger, popup } = menu;
    if (
      !host.contains(trigger) ||
      trigger.matches(":disabled") ||
      !trigger.getClientRects().length
    ) {
      close();
      return;
    }
    const left = (viewport?.offsetLeft ?? 0) + 8;
    const top = (viewport?.offsetTop ?? 0) + 8;
    const width = Math.max(1, (viewport?.width ?? window.innerWidth) - 16);
    const bottom = top + Math.max(1, (viewport?.height ?? window.innerHeight) - 16);
    const anchor = trigger.getBoundingClientRect();
    popup.style.maxWidth = `${width}px`;
    popup.style.minWidth = `${Math.min(width, anchor.width)}px`;
    const below = Math.max(0, bottom - anchor.bottom - 5);
    const above = Math.max(0, anchor.top - top - 5);
    const naturalHeight = Math.min(280, popup.scrollHeight + 2);
    const upward = below < naturalHeight && above > below;
    popup.style.maxHeight = `${Math.max(1, Math.min(280, upward ? above : below))}px`;
    const bounds = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(left, Math.min(anchor.left, left + width - bounds.width))}px`;
    popup.style.top = `${Math.max(top, Math.min(upward ? anchor.top - bounds.height - 5 : anchor.bottom + 5, bottom - bounds.height))}px`;
  }

  function activate(next: number) {
    if (!menu) return;
    const choices = items();
    index = Math.max(0, Math.min(next, choices.length - 1));
    choices.forEach((item, i) => item.toggleAttribute("data-active", i === index));
    const active = choices[index];
    if (!active) return;
    menu.trigger.setAttribute("aria-activedescendant", active.id);
    const popup = menu.popup;
    if (active.offsetTop < popup.scrollTop) popup.scrollTop = active.offsetTop;
    else if (active.offsetTop + active.offsetHeight > popup.scrollTop + popup.clientHeight)
      popup.scrollTop = active.offsetTop + active.offsetHeight - popup.clientHeight;
  }

  function open(root: HTMLElement) {
    close();
    const trigger = root.querySelector<HTMLButtonElement>(".select-trigger")!;
    if (trigger.matches(":disabled")) return;
    const popup = root.querySelector<HTMLElement>(".select-menu")!;
    menu = { root, trigger, popup };
    trigger.focus({ preventScroll: true });
    popup.showPopover();
    popup.addEventListener("beforetoggle", toggle);
    trigger.setAttribute("aria-expanded", "true");
    position();
    if (!menu) return;
    activate(items().findIndex((item) => item.dataset.value === trigger.value));
    observer = new ResizeObserver(position);
    observer.observe(trigger);
    observer.observe(popup);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    viewport?.addEventListener("resize", position);
    viewport?.addEventListener("scroll", position);
  }

  function choose() {
    if (!menu) return;
    const trigger = menu.trigger;
    const value = items()[index]?.dataset.value;
    close();
    if (value === undefined || trigger.matches(":disabled") || trigger.value === value) return;
    trigger.value = value;
    trigger.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function click(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const root = target.closest<HTMLElement>(".select-control");
    if (!root || !host.contains(root)) return;
    // A surrounding label must not activate the trigger again after selecting an option.
    event.preventDefault();
    const option = target.closest<HTMLElement>("[role=option]");
    if (option && menu?.root === root) {
      activate(items().indexOf(option));
      choose();
    } else if (target.closest(".select-trigger")) {
      if (menu?.root === root) close();
      else open(root);
    }
  }

  function pointerdown(event: PointerEvent) {
    if (!menu || event.button !== 0 || !(event.target instanceof Element)) return;
    if (menu.root.contains(event.target)) return;
    const canvasOrBackdrop =
      event.target.closest(".canvas-container") || event.target.matches("dialog");
    if (canvasOrBackdrop) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (event.isPrimary) close();
  }

  function mousedown(event: MouseEvent) {
    // Cancel focus movement, including compatibility mouse events after WebKit touch.
    // Canceling pointerdown instead can suppress the touch-generated click entirely.
    if (menu && event.target instanceof Element && menu.popup.contains(event.target))
      event.preventDefault();
  }

  function toggle(event: Event) {
    if ((event as ToggleEvent).newState === "closed") close();
  }

  function keydown(event: KeyboardEvent) {
    if (!(event.target instanceof Element)) return;
    const root = event.target.closest<HTMLElement>(".select-control");
    if (!root || !host.contains(root) || composing(event)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const wasOpen = menu?.root === root;
    const key = event.key;
    if (key === "Tab") {
      if (wasOpen) choose();
      return;
    }
    if (key === "Escape") {
      if (wasOpen) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(key) && key.length !== 1)
      return;
    event.preventDefault();
    event.stopPropagation();
    if (!wasOpen) open(root);
    if (!menu) return;
    if (key === "Enter" || key === " ") {
      if (wasOpen) choose();
    } else if (key === "Home") activate(0);
    else if (key === "End") activate(items().length - 1);
    else if (key === "ArrowDown") {
      if (wasOpen) activate(index + 1);
    } else if (key === "ArrowUp") {
      if (wasOpen) activate(index - 1);
    } else {
      const now = performance.now();
      search = now - typedAt > 700 ? key : search + key;
      typedAt = now;
      const query = [...search].every((char) => char === search[0]) ? key : search;
      const choices = items();
      const start = query.length === 1 ? index + 1 : index;
      for (let step = 0; step < choices.length; step++) {
        const next = (start + step) % choices.length;
        if (
          choices[next].textContent
            ?.trim()
            .toLocaleLowerCase()
            .startsWith(query.toLocaleLowerCase())
        ) {
          activate(next);
          break;
        }
      }
    }
  }

  function focusin(event: FocusEvent) {
    if (menu && event.target instanceof Node && !menu.root.contains(event.target)) close();
  }
  host.addEventListener("click", click);
  host.addEventListener("mousedown", mousedown);
  host.addEventListener("keydown", keydown);
  window.addEventListener("pointerdown", pointerdown, true);
  window.addEventListener("focusin", focusin);
  window.addEventListener("blur", close);
  return {
    close,
    sync() {
      for (const root of host.querySelectorAll<HTMLElement>(".select-control")) {
        const trigger = root.querySelector<HTMLButtonElement>(".select-trigger")!;
        const popup = root.querySelector<HTMLElement>(".select-menu")!;
        if (!popup.id) popup.id = `select-list-${++nextId}`;
        trigger.setAttribute("aria-controls", popup.id);
        popup.querySelectorAll("[role=option]").forEach((item, i) => {
          item.id = `${popup.id}-${i}`;
        });
      }
      if (menu) {
        const selected = items().find((item) => item.getAttribute("aria-selected") === "true");
        if (
          !host.contains(menu.root) ||
          menu.trigger.matches(":disabled") ||
          selected?.dataset.value !== menu.trigger.value
        )
          close();
        else {
          position();
          activate(index);
        }
      }
    },
    destroy() {
      close();
      host.removeEventListener("click", click);
      host.removeEventListener("mousedown", mousedown);
      host.removeEventListener("keydown", keydown);
      window.removeEventListener("pointerdown", pointerdown, true);
      window.removeEventListener("focusin", focusin);
      window.removeEventListener("blur", close);
    },
  };
}

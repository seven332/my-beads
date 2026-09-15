/** Native presentation, viewport positioning and dismissal for one mounted color picker. */
export function mountColorPickerOverlay(
  dialog: HTMLDialogElement,
  search: HTMLElement,
  dismiss: (restoreFocus: boolean) => void,
) {
  let compact: boolean | undefined;
  const palette = search.closest<HTMLElement>(".palette-panel")!;
  const viewport = window.visualViewport;
  function position() {
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    dialog.style.setProperty("--picker-available-height", `${Math.max(1, height - 24)}px`);
    dialog.style.setProperty("--picker-available-width", `${Math.max(1, width - 24)}px`);
    const bounds = dialog.getBoundingClientRect();
    const x = compact
      ? left + (width - bounds.width) / 2
      : Math.max(
          left + 12,
          Math.min(
            palette.getBoundingClientRect().left - bounds.width - 12,
            left + width - bounds.width - 12,
          ),
        );
    const y = compact
      ? top + height - bounds.height - 12
      : Math.max(
          top + 12,
          Math.min(search.getBoundingClientRect().top, top + height - bounds.height - 12),
        );
    dialog.style.left = `${x}px`;
    dialog.style.top = `${Math.max(top + 12, y)}px`;
  }
  function outside(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0 || !dialog.open) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const bounds = dialog.getBoundingClientRect();
    const backdrop =
      target === dialog &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom);
    if (!backdrop && dialog.contains(target)) return;
    // The desktop palette is part of the same task; its result click chooses before closing.
    if (!compact && (palette.contains(target) || target.closest("dialog"))) return;
    if (backdrop || target.closest(".canvas-container")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      dismiss(true);
    } else dismiss(false);
  }
  const observer = new ResizeObserver(position);
  observer.observe(dialog);
  observer.observe(palette);
  window.addEventListener("resize", position);
  window.addEventListener("pointerdown", outside, true);
  viewport?.addEventListener("resize", position);
  viewport?.addEventListener("scroll", position);
  return {
    sync(nextCompact: boolean) {
      if (compact !== nextCompact) {
        const active = document.activeElement;
        const focused = active instanceof HTMLElement && dialog.contains(active) ? active : null;
        dialog.setAttribute("data-switching", "");
        if (dialog.open) dialog.close();
        compact = nextCompact;
        if (compact) dialog.showModal();
        else dialog.show();
        position();
        (focused ?? dialog.querySelector<HTMLElement>(".color-hue"))?.focus({
          preventScroll: true,
        });
        dialog.removeAttribute("data-switching");
      }
    },
    destroy() {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("pointerdown", outside, true);
      viewport?.removeEventListener("resize", position);
      viewport?.removeEventListener("scroll", position);
      if (dialog.open) dialog.close();
    },
  };
}

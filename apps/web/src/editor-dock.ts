/** Keep the compact dock as narrow as its single row or widest wrapped row. */
export function mountEditorDock(dock: HTMLElement) {
  const layout = dock.closest<HTMLElement>(".editor-layout")!;
  const rows = [...dock.children];
  function sync() {
    const style = getComputedStyle(dock);
    if (style.display !== "flex") return;
    const layoutStyle = getComputedStyle(layout);
    const available =
      layout.clientWidth -
      parseFloat(layoutStyle.paddingLeft) -
      parseFloat(layoutStyle.paddingRight);
    const singleRowWidth =
      rows.reduce((width, row) => width + row.getBoundingClientRect().width, 0) +
      parseFloat(style.columnGap) +
      parseFloat(style.paddingLeft) +
      parseFloat(style.paddingRight) +
      parseFloat(style.borderLeftWidth) +
      parseFloat(style.borderRightWidth);
    dock.toggleAttribute("data-wrapped", singleRowWidth > available);
  }
  const observer = new ResizeObserver(sync);
  observer.observe(layout);
  for (const row of rows) observer.observe(row);
  sync();
  return {
    destroy() {
      observer.disconnect();
      dock.removeAttribute("data-wrapped");
    },
  };
}

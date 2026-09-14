import { h, type VNode } from "snabbdom";
import type { LucideIconData, LucideIconNode } from "@lucide/icons";

function svgNode([tag, { key, ...attrs }, children]: LucideIconNode): VNode {
  return h(tag, { key, attrs }, children?.map(svgNode));
}

/** Fresh vnodes let Snabbdom own each icon's updates; the surrounding control supplies its name. */
export function icon(data: LucideIconData): VNode {
  return h("svg.icon", { attrs: {
    width: 24, height: 24, viewBox: `0 0 ${data.width ?? data.size ?? 24} ${data.height ?? data.size ?? 24}`,
    fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round",
    "aria-hidden": "true", focusable: "false",
  } }, data.node.map(svgNode));
}

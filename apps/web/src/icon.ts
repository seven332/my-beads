import { html, nothing } from "lit-html";
import { svg, unsafeStatic } from "lit-html/static.js";
import { Directive, directive, type ElementPart } from "lit-html/directive.js";
import type { LucideIconData, LucideIconNode } from "@lucide/icons";

// Lucide supplies trusted tag/attribute data. Keep this adapter private to icons;
// document titles and other user content always use ordinary escaped bindings.
class IconAttributes extends Directive {
  private names: string[] = [];
  private previous: LucideIconNode[1] | undefined;
  render(_attrs: LucideIconNode[1]) {
    return nothing;
  }
  override update(part: ElementPart, [attrs]: [LucideIconNode[1]]) {
    if (this.previous === attrs) return nothing;
    this.previous = attrs;
    for (const name of this.names) if (!(name in attrs)) part.element.removeAttribute(name);
    this.names = Object.keys(attrs).filter((name) => name !== "key");
    for (const name of this.names) part.element.setAttribute(name, String(attrs[name]));
    return nothing;
  }
}
const iconAttributes = directive(IconAttributes);
function svgNode([tag, attrs, children]: LucideIconNode): ReturnType<typeof svg> {
  const name = unsafeStatic(tag);
  return svg`<${name} ${iconAttributes(attrs)}>${children?.map(svgNode)}</${name}>`;
}

/** The surrounding control supplies the accessible name; each template owns its nodes. */
export function icon(data: LucideIconData) {
  return html`<svg
    class="icon"
    width="24"
    height="24"
    viewBox=${`0 0 ${data.width ?? data.size ?? 24} ${data.height ?? data.size ?? 24}`}
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    ${data.node.map(svgNode)}
  </svg>`;
}

import { html, type TemplateResult } from "lit-html";

/** Keep input constraints, bindings and reset keys in the caller's control template. */
export function field(label: string, control: TemplateResult, size: "caption" | "ui" = "caption") {
  return html`<label
    class="${size === "ui" ? "text-ui" : "text-caption"} mb-[13px] grid gap-1.5 text-label"
    ><span>${label}</span>${control}</label
  >`;
}

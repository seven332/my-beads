import { expect, it } from "vitest";
import { attributesModule, h, init } from "snabbdom";
import { Eraser, Pencil, type LucideIconData } from "@lucide/icons";
import { icon } from "../src/icon.js";

it("keeps repeated icons independent when a neighboring icon changes", () => {
  const host = document.createElement("div"), root = document.createElement("div");
  host.append(root);
  const patch = init([attributesModule]), original = JSON.stringify(Pencil);
  let tree = patch(root, h("div", [icon(Pencil), icon(Pencil)]));
  const [first, second] = host.querySelectorAll("svg");
  const unchangedShape = second.innerHTML;
  expect(first).not.toBe(second);
  expect(first.firstElementChild).not.toBe(second.firstElementChild);
  tree = patch(tree, h("div", [icon(Eraser), icon(Pencil)]));
  expect(host.querySelectorAll("svg")[0]).toBe(first);
  expect(first.innerHTML).not.toBe(unchangedShape);
  expect(host.querySelectorAll("svg")[1]).toBe(second);
  expect(second.innerHTML).toBe(unchangedShape);
  expect(second.children.length).toBeGreaterThan(0);
  expect(host.querySelector("[key]")).toBeNull();
  expect(JSON.stringify(Pencil)).toBe(original);
  patch(tree, h("div"));
  expect(host.querySelector("svg")).toBeNull();
});

it("renders nested SVG nodes with native dimensions and decorative accessibility", () => {
  const data: LucideIconData = { width: 32, height: 16, node: [
    ["g", { key: "group" }, [["rect", { key: "shape", width: 32, height: 16 }]]],
  ] };
  const host = document.createElement("div"), root = document.createElement("div");
  host.append(root);
  init([attributesModule])(root, icon(data));
  const svg = host.querySelector("svg")!;
  for (const node of [svg, ...svg.querySelectorAll("*")]) expect(node.namespaceURI).toBe("http://www.w3.org/2000/svg");
  expect(svg.getAttribute("viewBox")).toBe("0 0 32 16");
  expect(svg.getAttribute("stroke")).toBe("currentColor");
  expect(svg.getAttribute("aria-hidden")).toBe("true");
  expect(svg.getAttribute("focusable")).toBe("false");
  expect(svg.hasAttribute("tabindex")).toBe(false);
  expect(svg.hasAttribute("aria-label")).toBe(false);
  expect(svg.querySelector("rect")?.getAttribute("width")).toBe("32");
});

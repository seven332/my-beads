import { expect, it } from "vitest";
import { html, render, nothing } from "lit-html";
import { Eraser, Pencil, type LucideIconData } from "@lucide/icons";
import { icon } from "../src/icon.js";

it("keeps repeated icons independent when a neighboring icon changes", () => {
  const host = document.createElement("div"), original = JSON.stringify(Pencil);
  const view = (first: LucideIconData) => html`<div>${icon(first)}${icon(Pencil)}</div>`;
  render(view(Pencil), host);
  const [first, second] = host.querySelectorAll("svg");
  const unchangedShape = second.innerHTML;
  expect(first).not.toBe(second);
  expect(first.firstElementChild).not.toBe(second.firstElementChild);
  render(view(Eraser), host);
  expect(host.querySelectorAll("svg")[0]).toBe(first);
  expect(first.innerHTML).not.toBe(unchangedShape);
  expect(host.querySelectorAll("svg")[1]).toBe(second);
  expect(second.innerHTML).toBe(unchangedShape);
  expect(second.children.length).toBeGreaterThan(0);
  expect(host.querySelector("[key]")).toBeNull();
  expect(JSON.stringify(Pencil)).toBe(original);
  render(nothing, host);
  expect(host.querySelector("svg")).toBeNull();
});

it("renders nested SVG nodes with native dimensions and decorative accessibility", () => {
  const data: LucideIconData = { width: 32, height: 16, node: [
    ["g", { key: "group" }, [["rect", { key: "shape", width: 32, height: 16 }]]],
  ] };
  const host = document.createElement("div");
  render(icon(data), host);
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

it("updates shape attributes, removes obsolete ones and treats values as text", () => {
  const host = document.createElement("div");
  render(icon({ node: [["rect", { x: 4, width: 12, height: 12 }]] }), host);
  const rect = host.querySelector("rect")!;
  const value = '\"><circle onload="unexpected()">';
  render(icon({ node: [["rect", { width: 20, height: 12, fill: value }]] }), host);
  expect(host.querySelector("rect")).toBe(rect);
  expect(rect.hasAttribute("x")).toBe(false);
  expect(rect.getAttribute("width")).toBe("20");
  expect(rect.getAttribute("fill")).toBe(value);
  expect(host.querySelector("circle")).toBeNull();
});

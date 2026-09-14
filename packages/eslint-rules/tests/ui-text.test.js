import { ESLint, RuleTester } from "eslint";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { parser } from "typescript-eslint";
import { rules } from "../index.js";

RuleTester.describe = describe;
RuleTester.it = it;
const tester = new RuleTester({
  languageOptions: { parser, ecmaVersion: "latest", sourceType: "module" },
});
const prefix = 'import { h } from "snabbdom"; ';
const options = [
  {
    allowedLiterals: ["MARD 221", "CSV", "PNG", "H7", "Enter"],
    textFunctions: [{ module: "./image-view.js", name: "imagePicker", arguments: [0, 1] }],
  },
];
const valid = (code) => ({ code: prefix + code, options });
const invalid = (code, count = 1) => ({
  ...valid(code),
  errors: Array.from({ length: count }, () => ({ messageId: "literal" })),
});

tester.run("no-hardcoded-ui-text", rules["no-hardcoded-ui-text"], {
  valid: [
    valid(
      'h("button.primary", { attrs: { type: "submit", class: "primary" } }, t($ => $.export.download));',
    ),
    valid(
      'h("input", { attrs: { id: "palette-search", role: "searchbox", name: "query", "aria-describedby": "search-help", placeholder: t($ => $.palette.search) } });',
    ),
    valid('h("p", `↑ ${t($ => $.export.download)} · ${count}%`);'),
    valid('h("span", ["MARD 221", "H7", "#4C4C40", "CSV", "Enter", "→", "123"]);'),
    valid('h("p", `MARD 221 · ${count}`);'),
    valid('h("div", userInput); h("div", document.title);'),
    valid('h("input", { attrs: { name: "series", type: "text", value: "B, H" } });'),
    valid(
      'const labels = { save: t($ => $.save), cancel: t($ => $.cancel) }; h("p", labels[action]);',
    ),
    valid(
      'const base = { save: t($ => $.save) }; const labels = { ...base }; h("p", labels[action]);',
    ),
    valid(
      'const base = { save: t($ => $.save) }; const labels = { ...base }; Object.entries(labels).map(([id, text]) => h("p", text));',
    ),
    valid(
      'const base = [["save", t($ => $.save)]]; const labels = [...base]; labels.map(([id, text]) => h("p", text));',
    ),
    valid(
      'let labels = { save: t($ => $.save) }; labels = { ...labels }; Object.values(labels).map(text => h("p", text));',
    ),
    valid(
      'let labels = [["save", t($ => $.save)]]; labels = [...labels]; labels.map(([id, text]) => h("p", text));',
    ),
    valid(
      'function button(label, name) { return h("button", { attrs: { name } }, label); } button(t($ => $.save), "save");',
    ),
    valid(
      'const entries = [{ id: "save", text: t($ => $.save) }]; entries.map(item => h("p", item.text));',
    ),
    valid(
      'const entries = [["save", t($ => $.save)]] as const; entries.map(([id, text]) => h("p", text));',
    ),
    valid('function render(h) { h("button", "Not a Snabbdom call"); }'),
    { code: 'import { h } from "other-library"; h("button", "Different API");', options },
    valid('new UiError("csvSize");'),
    valid('function run(Error) { throw new Error("Internal custom class"); }'),
    valid('import { imagePicker } from "./other-module.js"; imagePicker("not text", "not text");'),
    valid(
      'import { imagePicker } from "./image-view.js"; function render(imagePicker) { imagePicker("not text"); }',
    ),
    valid(
      'const unused = "Internal value"; const value = node.getAttribute("title"); h("p", value);',
    ),
    valid('const recursive = () => recursive(); h("p", recursive());'),
    valid('const a = b, b = a; h("p", a);'),
    valid('let labels = { save: t($ => $.save) }; labels = { ...labels }; h("p", labels.save);'),
    valid(
      'let first = { save: t($ => $.save) }; let second = { ...first }; first = { ...second }; h("p", first.save);',
    ),
    valid(
      'element.setAttribute("data-id", "internal-identifier"); element.setAttribute("aria-labelledby", "dialog-heading");',
    ),
    valid('function button({ text = t($ => $.save) }) { return h("button", text); } button({});'),
    valid('const make = h; function render(make) { make("p", "Unrelated function"); }'),
    valid('h("input", { props: { defaultValue: "50" } });'),
    valid(
      'const items = [{ id: "save", text: t($ => $.save) }]; const render = item => h("p", item.text); items.filter(allowed).map(render);',
    ),
  ],
  invalid: [
    invalid('h("button", "Save");'),
    invalid('h("button", { attrs: { type: "button" } }, "保存");'),
    invalid('h("span", "save");'),
    invalid('h("span", "EXPORT");'),
    invalid('h("span", "\\u0053ave");'),
    invalid('h("div", [h("span", t($ => $.save)), "Cancel"]);'),
    invalid('h("p", `${count} beads`);'),
    invalid('h("p", count + " beads");'),
    invalid('h("p", ready ? t($ => $.ready) : "Loading");'),
    invalid('h("p", value || "Empty");'),
    invalid('h("p", ready && "Ready");'),
    invalid('const copy = "Save"; const alias = copy; h("p", alias);'),
    invalid('let copy = t($ => $.save); copy = "Save"; h("p", copy);'),
    invalid('const labels = { save: "Save", cancel: "Cancel" }; h("p", labels[action]);', 2),
    invalid('const base = { save: "Save" }; const labels = { ...base }; h("p", labels[action]);'),
    invalid(
      'const base = { save: "Save" }; const labels = { ...base }; Object.entries(labels).map(([id, text]) => h("p", text));',
    ),
    invalid(
      'const base = { save: "Save" }; const labels = { ...base }; Object.values(labels).map(text => h("p", text));',
    ),
    invalid(
      'const base = { Save: t($ => $.save) }; const labels = { ...base }; Object.entries(labels).map(([text]) => h("p", text));',
    ),
    invalid(
      'const base = [["save", "Save"]]; const labels = [...base]; labels.map(([id, text]) => h("p", text));',
    ),
    invalid(
      'const base = [{ copy: "Save" }]; const labels = [...base]; labels.map(item => h("p", item.copy));',
    ),
    invalid('const base = ["Save"]; const labels = [...base]; h("p", labels[index]);'),
    invalid(
      'let labels = { save: "Save" }; labels = { ...labels }; Object.values(labels).map(text => h("p", text));',
    ),
    invalid(
      'let labels = [["save", "Save"]]; labels = [...labels]; labels.map(([id, text]) => h("p", text));',
    ),
    invalid('const labels = { save: "Save", cancel: t($ => $.cancel) }; h("p", labels.save);'),
    invalid(
      'const labels = { nested: { text: "Save" } }; const { nested: { text: copy } } = labels; h("p", copy);',
    ),
    invalid('const labels = { save: "Save" }; const next = { ...labels }; h("p", next.save);'),
    invalid('let labels = { save: "Save" }; labels = { ...labels }; h("p", labels.save);'),
    invalid(
      'let labels = { nested: { save: "Save" } }; labels = { ...labels }; h("p", labels.nested.save);',
    ),
    invalid(
      'let first = { save: "Save" }; let second = { ...first }; first = { ...second }; h("p", first.save);',
    ),
    invalid('const labels = ["Save"]; h("p", labels[0]);'),
    invalid(
      'const labels = [["save", "Save"]] as const; labels.map(([id, text]) => h("p", text));',
    ),
    invalid(
      'const choices = [{ id: "save", text: "Save" }]; choices.map(choice => h("p", choice.text));',
    ),
    invalid(
      'const labels = { save: "Save" }; Object.entries(labels).map(([id, text]) => h("p", text));',
    ),
    invalid('const labels = { save: "Save" }; Object.values(labels).map(text => h("p", text));'),
    invalid('h("p", ["Save"].map(text => text));'),
    invalid('function button(label) { return h("button", label); } button("Save");'),
    invalid('const button = (label: string) => h("button", label); button("Save");'),
    invalid('function button({ text }) { return h("button", text); } button({ text: "Save" });'),
    invalid('function button(text = "Save") { return h("button", text); } button();'),
    invalid(
      'function button(text) { return h("button", text); } const alias = button; alias("Save");',
    ),
    invalid('const ui = { button(text) { return h("button", text); } }; ui.button("Save");'),
    invalid('function caption() { return "Save"; } h("p", caption());'),
    invalid('function t() { return "Fake translation"; } h("p", t());'),
    invalid('h("p", "Save".toUpperCase());'),
    invalid('h("p", items.join(" and "));'),
    invalid('h("input", { attrs: { placeholder: "Search" } });'),
    invalid('const attrs = { ["aria-label"]: "Search" }; h("input", { attrs });'),
    invalid('const tooltip = "Help"; h("span", { attrs: { title: tooltip } });'),
    invalid('h("img", { attrs: { alt: "Preview" } });'),
    invalid('h("button", { attrs: { "aria-description": "Saves the pattern" } }, t($ => $.save));'),
    invalid('const status = { message: "Saved" }; h("p", status.message);'),
    invalid('document.title = "Pattern editor";'),
    invalid('element.textContent = "Ready";'),
    invalid('h("input", { attrs: { type: "submit", value: "Save" } });'),
    invalid('h("input", { attrs: { type: "button" }, props: { value: "Save" } });'),
    invalid('throw new Error("Unable to read CSV");'),
    invalid('alert("Unsaved changes");'),
    invalid('context.fillText("Pattern", 0, 0);'),
    invalid('import { h as node } from "snabbdom"; node("p", "Save");'),
    invalid('import * as dom from "snabbdom"; dom.h("p", "Save");'),
    invalid('import * as dom from "snabbdom"; dom["h"]("p", "Save");'),
    invalid(
      'import { imagePicker as picker } from "./image-view.js"; picker("Open image", t($ => $.image.name), onFile);',
    ),
    invalid(
      'import * as images from "./image-view.js"; images.imagePicker(t($ => $.open), "Open image", onFile);',
    ),
    invalid('h("p", "Save CSV");'),
    invalid('const make = h; make("p", "Save");'),
    invalid('import * as dom from "snabbdom"; const nodes = dom; nodes.h("p", "Save");'),
    invalid('import * as dom from "snabbdom"; const make = dom.h; make("p", "Save");'),
    invalid('const { text = "Save" } = settings; h("p", text);'),
    invalid('function button({ text = "Save" }) { return h("button", text); } button({});'),
    invalid('function button({ text } = { text: "Save" }) { return h("button", text); } button();'),
    invalid('element.setAttribute("aria-label", "Search");'),
    invalid('element.setAttributeNS(null, "aria-label", "Search");'),
    invalid('window.confirm("Discard changes?");'),
    invalid('document.createTextNode("Loading");'),
    invalid('h("input", { props: { defaultValue: "Your name" } });'),
    invalid('t($ => $.save, { defaultValue: "Save" });'),
    invalid(
      'const items = [{ id: "save", text: "Save" }]; const render = item => h("p", item.text); items.map(render);',
    ),
    invalid('const items = ["Save"]; items.filter(enabled).slice(0, 1).map(text => h("p", text));'),
    invalid('const items = { save: "Save" }; h("div", Object.values(items));'),
    invalid('import * as dom from "snabbdom"; const { h: make } = dom; make("p", "Save");'),
    invalid(
      'import * as images from "./image-view.js"; const { imagePicker: picker } = images; picker("Open image", t($ => $.open));',
    ),
  ],
});

it("enforces the rule through the repository's real ESLint configuration without flagging export/test text", async () => {
  const eslint = new ESLint({ cwd: fileURLToPath(new URL("../../../", import.meta.url)) });
  const ruleId = "ccstate/no-hardcoded-ui-text";
  const [web] = await eslint.lintText(prefix + 'h("button", "Save");', {
    filePath: "apps/web/src/lint-probe.ts",
  });
  assert.deepEqual(
    web.messages.map((message) => [message.ruleId, message.severity]),
    [[ruleId, 2]],
  );
  const [codes] = await eslint.lintText(prefix + 'h("p", ["H7", "B23", "MARD 221", "#4C4C40"]);', {
    filePath: "apps/web/src/lint-probe.ts",
  });
  assert.deepEqual(codes.messages, []);
  for (const filePath of [
    "packages/core/src/lint-probe.ts",
    "apps/cli/src/lint-probe.ts",
    "apps/web/tests/lint-probe.test.ts",
  ]) {
    const [result] = await eslint.lintText('const chartTitle = "Printable chart";', { filePath });
    assert.equal(
      result.messages.some((message) => message.ruleId === ruleId),
      false,
    );
  }
});

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
const options = [{ allowedLiterals: ["MARD 221", "H7", "CSV"] }];
const prefix = 'import { html, svg } from "lit-html"; ';
const valid = (code) => ({ code: prefix + code, options });
const invalid = (code, count = 1) => ({
  ...valid(code),
  errors: Array.from({ length: count }, () => ({ messageId: "literal" })),
});

tester.run("lit-html UI copy", rules["no-hardcoded-ui-text"], {
  valid: [
    valid('html`<button type="button" class="save" @click=${save}>${t($ => $.save)}</button>`;'),
    valid(
      "html`<input placeholder=${t($ => $.search)} aria-label=${t($ => $.search)} .value=${userInput}>`;",
    ),
    valid("html`<p>MARD 221 · ${count} · H7</p>`;"),
    valid("html`<p>&#35;4C4C40</p><p>CSV</p><p>→ ${count}%</p>`;"),
    valid(
      "html`<!-- internal copy --><style>.save { color: red }</style><script>internal()</script>`;",
    ),
    valid(
      'html`<div id="save" data-label="internal" style="color:red" aria-labelledby="help" ${ref(node)}>${user.title}</div>`;',
    ),
    valid('html`<input type="number" .defaultValue=${"50"}><input type="text" .value=${"B,H"}>`;'),
    valid("function make(text) { return html`<p>${text}</p>`; } make(t($ => $.ready));"),
    valid(
      'const items = [{ id: "save", text: t($ => $.save) }]; html`${items.map(item => html`<p>${item.text}</p>`)}`;',
    ),
    valid(
      'import { repeat } from "lit-html/directives/repeat.js"; const items = [["save", t($ => $.save)]]; html`${repeat(items, ([id]) => id, ([id, text]) => html`<p>${text}</p>`)}`;',
    ),
    valid("function render(html) { return html`<p>Different library</p>`; }"),
    { code: 'import { html } from "unrelated"; html`<p>Other syntax</p>`;', options },
    valid("const html2 = html; function render(html2) { return html2`Other syntax`; }"),
    valid("const cycle = () => cycle(); html`${cycle()}`;"),
  ],
  invalid: [
    invalid("html`<button>Save</button>`;"),
    invalid("html`<p>保存</p>`;"),
    invalid("html`<button>S&#97;ve</button>`;"),
    invalid('html`<input placeholder="Search">`;'),
    invalid('html`<div aria-label="S&#97;ve"></div>`;'),
    invalid('html`<input .placeholder=${"Search"}>`;'),
    invalid('html`<input .defaultValue=${"Your name"}>`;'),
    invalid('html`<div .textContent=${"Ready"}></div>`;'),
    invalid('html`<input type="submit" value="Save">`;'),
    invalid('const type = "button"; html`<input .type=${type} .value=${"Save"}>`;'),
    invalid("html`<p>${count} beads</p>`;"),
    invalid('html`<p>${ready ? t($ => $.ready) : "Loading"}</p>`;'),
    invalid('const copy = "Ready"; const alias = copy; html`<p>${alias}</p>`;'),
    invalid('html`<p>${["Save", "Cancel"]}</p>`;', 2),
    invalid("html`<div>${html`<button>Save</button>`}</div>`;"),
    invalid('const make = (text) => html`<p>${text}</p>`; make("Save");'),
    invalid('function caption() { return "Ready"; } html`${caption()}`;'),
    invalid(
      'const items = [{ id: "save", text: "Save" }]; html`${items.map(item => html`<p>${item.text}</p>`)}`;',
    ),
    invalid(
      'import { repeat } from "lit-html/directives/repeat.js"; const items = [["save", "Save"]]; html`${repeat(items, ([id]) => id, ([id, text]) => html`<p>${text}</p>`)}`;',
    ),
    invalid(
      'import { repeat as rows } from "lit-html/directives/repeat.js"; html`${rows(["Save"], text => text)}`;',
    ),
    invalid(
      'import { live as current } from "lit-html/directives/live.js"; html`<input placeholder=${current("Search")}>`;',
    ),
    invalid('import { keyed } from "lit-html/directives/keyed.js"; html`${keyed(id, "Save")}`;'),
    invalid('import { html as template } from "lit-html"; template`<p>Save</p>`;'),
    invalid('import * as lit from "lit-html"; lit.html`<p>Save</p>`;'),
    invalid(
      'import * as lit from "lit-html"; const { html: template } = lit; template`<p>Save</p>`;',
    ),
    invalid("const template = html; template`<p>Save</p>`;"),
    invalid("svg`<text>Save</text>`;"),
    invalid('import { html as staticHtml } from "lit-html/static.js"; staticHtml`<p>Save</p>`;'),
    invalid("html`<textarea>Write here</textarea>`;"),
    invalid("html`<template><p>Save</p></template>`;"),
    invalid("html`<p>litexpression0end ${t($ => $.save)}</p>`;"),
  ],
});

it("runs template syntax, binding and copy checks through the real web configuration", async () => {
  const eslint = new ESLint({ cwd: fileURLToPath(new URL("../../../", import.meta.url)) });
  const fixtures = [
    ["html`<p>Save</p>`;", "ccstate/no-hardcoded-ui-text"],
    ["html`<div =bad></div>`;", "lit/no-invalid-html"],
    ["html`<${tag}></${tag}>`;", "lit/binding-positions"],
    ["html`<input disabled?=${disabled}>`;", "lit/no-legacy-template-syntax"],
    ["html`<input value=${value}>`;", "lit/no-value-attribute"],
    ["html`<button on-click=${handler}></button>`;", "lit/no-legacy-template-syntax"],
    ["html`<input .value=${value} .value=${other}>`;", "lit/no-duplicate-template-bindings"],
    ["html`<input .value=${value} min=${minimum}>`;", "lit/value-after-constraints"],
  ];
  for (const [code, rule] of fixtures) {
    const [result] = await eslint.lintText(prefix + code, {
      filePath: "apps/web/src/lint-probe.ts",
    });
    assert.ok(
      result.messages.some((message) => message.ruleId === rule && message.severity === 2),
      `${code}: ${JSON.stringify(result.messages)}`,
    );
  }
  const [clean] = await eslint.lintText(
    prefix +
      'html`<input type="number" min="1" .value=${live(value)} ?disabled=${busy} @input=${handle} aria-label=${t($ => $.size)}>`;',
    { filePath: "apps/web/src/lint-probe.ts" },
  );
  assert.deepEqual(clean.messages, []);
});

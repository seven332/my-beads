import { RuleTester } from "eslint";
import { describe, it } from "node:test";
import { parser } from "typescript-eslint";
import { rules } from "../index.js";
const tester = new RuleTester({ languageOptions: { parser, ecmaVersion: "latest", sourceType: "module" } });
RuleTester.describe = describe;
RuleTester.it = it;
const prefix = 'import { state, computed, command } from "ccstate"; ';
const invalid = (code, count = 1) => ({ code: prefix + code, errors: Array.from({ length: count }, () => ({ messageId: "invalid" })) });
tester.run("signal-boundaries", rules["signal-boundaries"], {
  valid: [prefix + "const data$ = state(0); export const read$ = computed(get => get(data$));",
    prefix + "const inner$ = command(() => {}); const outer$ = command(({set}) => set(inner$));",
    'function state(value) { return value; } const plain = state(1);'],
  invalid: [invalid("export const data$ = state(0);"), invalid("const data = state(0);"),
    invalid("const data$ = state(0); export { data$ };"),
    invalid("const outer$ = command(() => { const inner$ = command(() => {}); });"),
    { code: 'import { state as atom } from "ccstate"; export const data$ = atom(0);', errors: [{ messageId: "invalid" }] }],
});
tester.run("accessor-scope", rules["accessor-scope"], {
  valid: [prefix + "const read$ = computed(get => get(data$));", prefix + "const edit$ = command(({get, set}) => set(data$, get(data$) + 1));"],
  invalid: [invalid("const read$ = computed(get => helper(get));"), invalid("const edit$ = command(({set}) => { const alias = set; });"),
    invalid("const edit$ = command(({get}) => () => get(data$));"), invalid("const edit$ = command(({set}) => { setTimeout(() => set(data$, 1), 0); });")],
});
tester.run("async-ownership", rules["async-ownership"], {
  valid: [prefix + "const load$ = command(async ({set}, signal: AbortSignal) => { const value = await read(); signal.throwIfAborted(); set(data$, value); });",
    { filename: "/project/apps/web/src/app.ts", code: "const lifetime = new AbortController();" }],
  invalid: [invalid("const load$ = command(async () => {});"),
    invalid("const load$ = command(async ({set}, signal: AbortSignal) => { const value = await read(); set(data$, value); });"),
    invalid("const load$ = command(async ({set}, signal: AbortSignal) => { return await read(); });"),
    { filename: "/project/apps/web/src/state.ts", code: "new AbortController();", errors: [{ messageId: "invalid" }] }],
});

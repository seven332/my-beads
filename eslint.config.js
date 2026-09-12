import tseslint from "typescript-eslint";
import ccstate from "./packages/eslint-rules/index.js";
export default [
  { ignores: ["**/node_modules/**", "**/dist/**", "codex-work/**", "**/test-results/**", "**/playwright-report/**"] },
  { files: ["**/*.ts"], languageOptions: { parser: tseslint.parser }, rules: {
    "no-debugger": "error", "no-constant-condition": "error", "no-duplicate-imports": "error",
  } },
  { files: ["apps/web/src/**/*.ts"], plugins: { ccstate }, rules: {
    "ccstate/signal-boundaries": "error", "ccstate/accessor-scope": "error", "ccstate/async-ownership": "error",
  } },
];

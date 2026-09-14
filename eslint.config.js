import tseslint from "typescript-eslint";
import lit from "eslint-plugin-lit";
import ccstate from "./packages/eslint-rules/index.js";
import mard from "./packages/core/src/data/mard-221-colors.json" with { type: "json" };
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "codex-work/**",
      "**/test-results/**",
      "**/playwright-report/**",
    ],
  },
  {
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    rules: {
      "no-debugger": "error",
      "no-constant-condition": "error",
      "no-duplicate-imports": "error",
    },
  },
  { ...lit.configs["flat/recommended"], files: ["apps/web/src/**/*.ts"] },
  {
    files: ["apps/web/src/**/*.ts"],
    plugins: { ccstate },
    rules: {
      "lit/no-value-attribute": "error",
      "lit/value-after-constraints": "error",
      "ccstate/signal-boundaries": "error",
      "ccstate/accessor-scope": "error",
      "ccstate/async-ownership": "error",
      "ccstate/no-hardcoded-ui-text": [
        "error",
        {
          // Locale names, the palette name and file/key identifiers retain their spelling.
          allowedLiterals: [
            "English",
            "简体中文",
            "MARD 221",
            "CSV",
            "PNG",
            "SVG",
            "WebP",
            "Enter",
            "Space",
            "Shift",
            "Ctrl",
            "Alt",
            "Cmd",
            ...Object.keys(mard.colors),
          ],
          textFunctions: [{ module: "./image-view.js", name: "imagePicker", arguments: [0, 1] }],
        },
      ],
    },
  },
];

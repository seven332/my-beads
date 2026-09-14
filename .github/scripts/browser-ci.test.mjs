import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { browserChecksPassed, browserTestsRequired, detectBrowserChanges } from "./browser-ci.mjs";

test("only known documentation may skip browser tests", () => {
  assert.equal(browserTestsRequired(["README.md", "docs/browser-ci.md"]), false);
  assert.equal(
    browserTestsRequired([
      "CONTRIBUTING.md",
      ".github/ISSUE_TEMPLATE/bug.md",
      ".github/PULL_REQUEST_TEMPLATE.md",
    ]),
    false,
  );
  for (const path of [
    "apps/web/src/app.ts",
    "apps/web/README.md",
    "packages/core/src/csv.ts",
    "templates/hollow-knight/sherma-singing-50x50.csv",
    "templates/hollow-knight/king-zote-vengefly.webp",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    ".npmrc",
    ".github/workflows/checks.yml",
    ".github/scripts/browser-ci.mjs",
    "docs/example.ts",
    "unknown.txt",
    "README.md\napp.ts",
    "README.md\n",
  ]) {
    assert.equal(browserTestsRequired(["README.md", path]), true, path);
  }
  assert.equal(browserTestsRequired([]), true);
});

test("the aggregate check accepts only complete success or intentional documentation skips", () => {
  const outcomes = ["success", "failure", "cancelled", "skipped", undefined];
  for (const changes of outcomes) {
    for (const browser of ["true", "false", "", undefined]) {
      for (const e2e of outcomes) {
        for (const production of outcomes) {
          const expected =
            changes === "success" &&
            ((browser === "true" && e2e === "success" && production === "success") ||
              (browser === "false" && e2e === "skipped" && production === "skipped"));
          assert.equal(
            browserChecksPassed({
              changes: { result: changes, outputs: { browser } },
              e2e: { result: e2e },
              production: { result: production },
            }),
            expected,
            JSON.stringify({ changes, browser, e2e, production }),
          );
        }
      }
    }
  }
  assert.equal(browserChecksPassed(undefined), false);
  assert.equal(browserChecksPassed({ changes: { result: "success" } }), false);
  assert.equal(
    browserChecksPassed({ changes: { result: "success", outputs: { browser: "true" } } }),
    false,
  );
});

test("git comparisons preserve PR scope, deleted/renamed paths, and conservative fallbacks", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "my-beads-browser-ci-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = (message) => {
    git("add", ".");
    git("-c", "user.name=CI Test", "-c", "user.email=ci@example.invalid", "commit", "-m", message);
    return git("rev-parse", "HEAD");
  };
  git("init", "--initial-branch=main");
  writeFileSync(join(cwd, "README.md"), "Initial\n");
  writeFileSync(join(cwd, "app.ts"), "export {};\n");
  const initial = commit("Initial");
  git("checkout", "-b", "docs");
  writeFileSync(join(cwd, "README.md"), "Updated\n");
  const docs = commit("Documentation");
  const push = (before, after) => detectBrowserChanges("push", { before, after }, cwd).required;
  assert.equal(push(initial, docs), false);

  // Main advances independently: its runtime change is not part of the docs PR.
  git("checkout", "main");
  writeFileSync(join(cwd, "app.ts"), "export const value = 1;\n");
  const main = commit("Runtime on main");
  assert.equal(
    detectBrowserChanges(
      "pull_request",
      { pull_request: { base: { sha: main }, head: { sha: docs } } },
      cwd,
    ).required,
    false,
  );
  git("checkout", "docs");
  mkdirSync(join(cwd, "docs"));
  renameSync(join(cwd, "app.ts"), join(cwd, "docs", "example.md"));
  const renamed = commit("Move runtime into docs");
  assert.equal(push(docs, renamed), true);
  writeFileSync(join(cwd, "README.md\napp.ts"), "export {};\n");
  const unusual = commit("Unusual filename");
  assert.equal(push(renamed, unusual), true);
  rmSync(join(cwd, "README.md\napp.ts"));
  assert.equal(push(unusual, commit("Delete runtime file")), true);

  assert.equal(push(initial, initial), true);
  assert.equal(push("0".repeat(40), docs), true);
  assert.equal(push("a".repeat(40), docs), true);
  assert.equal(push("--help", docs), true);
  assert.equal(detectBrowserChanges("push", {}, cwd).required, true);
  assert.equal(detectBrowserChanges("workflow_dispatch", {}, cwd).required, true);

  const script = fileURLToPath(new URL("./browser-ci.mjs", import.meta.url));
  const eventPath = join(cwd, "event.json");
  const outputPath = join(cwd, "output.txt");
  const summaryPath = join(cwd, "summary.md");
  writeFileSync(eventPath, JSON.stringify({ before: initial, after: docs }));
  execFileSync(process.execPath, [script, "changes"], {
    cwd,
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "push",
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      GITHUB_STEP_SUMMARY: summaryPath,
    },
  });
  assert.equal(readFileSync(outputPath, "utf8"), "browser=false\n");
  assert.match(readFileSync(summaryPath, "utf8"), /Only known documentation/);
  const gate = (e2e) =>
    execFileSync(process.execPath, [script, "gate"], {
      cwd,
      env: {
        ...process.env,
        BROWSER_NEEDS: JSON.stringify({
          changes: { result: "success", outputs: { browser: "true" } },
          e2e: { result: e2e },
          production: { result: "success" },
        }),
      },
      stdio: "pipe",
    });
  assert.match(gate("success").toString(), /passed/);
  assert.throws(
    () => gate("failure"),
    (error) => error.status === 1,
  );
});

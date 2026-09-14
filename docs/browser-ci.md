# Browser CI

The Checks workflow validates every pull request and push to main. Its stable **Browser workflows**
check summarizes browser verification; keep this check required rather than requiring individual
shards, which intentionally skip documentation-only changes.

## Change detection

Browser setup and tests are skipped only when every changed file matches one of these documentation
paths:

- `README.md` or `CONTRIBUTING.md` at the repository root
- Markdown files under `docs/`
- `.github/PULL_REQUEST_TEMPLATE.md`
- Markdown files directly under `.github/ISSUE_TEMPLATE/`

Everything else runs browser tests, including package documentation, web/core code, templates used as
fixtures, dependencies, configuration, and workflows. New runtime inputs need no allowlist update.
Keep the documentation paths above free of runtime/build inputs.

Pull requests compare their head with the merge base of the base branch. Pushes compare the before
and after commits. Both sides of renames are checked. Empty diffs, unsupported events, and unavailable
commit history conservatively run the tests. A failed detection job fails the aggregate check.
The format, lint, typecheck, unit-test, CI-helper-test, and build jobs still run for documentation.

## Parallel execution and diagnostics

Two E2E shards each use two workers and run half of the Chromium tests followed by half of the WebKit
tests. Sharding separately within each project shares WebKit's heavier work across both runners;
global sharding would put the two complete browser projects on different runners. Playwright splits
tests within each project because `fullyParallel` is enabled. A separate production smoke job builds
the web app and verifies its deployed base path in both browsers. A failed shard does not cancel its
sibling, and a Chromium test failure does not skip the corresponding WebKit tests.

CI records a trace on the first retry; local tests keep `retain-on-failure`. Each shard uploads an
HTML report with per-test durations and its test results, even when a retry succeeds. Artifacts are
retained for seven days:

| Artifact                         | Contents                                        |
| -------------------------------- | ----------------------------------------------- |
| `browser-e2e-1`, `browser-e2e-2` | E2E report and results for one shard            |
| `browser-production`             | Production smoke report and results             |
| `pages-browser-production`       | Production verification from the Pages workflow |

After downloading and extracting an artifact, open its HTML report from the repository root:

```sh
pnpm --filter @my-beads/web exec playwright show-report /path/to/extracted/playwright-report/e2e/chromium
```

Use `playwright-report/e2e/webkit` for WebKit and `playwright-report/production` for production
artifacts. Both browsers and production use separate report and result directories, so one invocation
cannot erase the other's diagnostics. Cancelled runs do not guarantee an artifact upload.

The aggregate check passes only when detection succeeds and all browser jobs succeed, or when
documentation-only detection intentionally skips all browser jobs. Missing results, unexpected
skips, failures, and cancellations cannot turn into a successful check.

New commits cancel older Checks runs for the same pull request. Main checks run independently. Pages
still deploys only from main under its existing path filters and deployment concurrency policy.

## Local verification

Use Node.js 24+ and the repository's pnpm version:

```sh
pnpm test:ci
pnpm --filter @my-beads/web exec playwright install --with-deps --only-shell chromium webkit
CI=1 PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report/e2e/chromium pnpm test:e2e --project=chromium --shard=1/2 --output=test-results/e2e/chromium
CI=1 PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report/e2e/webkit pnpm test:e2e --project=webkit --shard=1/2 --output=test-results/e2e/webkit
CI=1 pnpm test:production
```

Repeat the browser commands with `--shard=2/2` for the other half. Run shards sequentially on one
machine because they share the dev-server port. CI runs each shard on a separate runner. CI-mode local
runs generate the same report layout; another invocation of the same browser replaces its previous
report/results. Plain `pnpm test:e2e` still runs the full suite locally.

The measured pre-change browser job took 285 seconds, including 229 seconds of E2E and 40 seconds of
browser/system installation. Sharding trades additional runner usage for faster elapsed time.
Compare the full path from change detection through the aggregate check, not just one shard's test
step. Downloads use `--only-shell` because the tests do not use headed Chromium or a browser channel.

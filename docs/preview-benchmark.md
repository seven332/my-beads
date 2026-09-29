# 3D preview measurements

The opt-in benchmark drives the normal production editor, with generated CSV patterns and browser-only instrumentation. It does not add monitoring to the shipped app or run the timing matrix in CI. The small probe regression runs with the ordinary browser suite; statistical and compatibility checks run with web unit tests.

## Run and compare

Install the documented Node/pnpm dependencies and Playwright Chromium/WebKit browsers. Close competing workloads, keep power/thermal conditions stable and use the same machine for comparisons. From the repository root:

```sh
# The command builds the ordinary production bundle and owns a preview server on 4174.
# Output paths are relative to apps/web. Use dedicated directories: Playwright clears its output.
PREVIEW_BENCHMARK_DEVICE="local-desktop" pnpm benchmark:3d --repeat-each=3 --output=../../codex-work/benchmarks/baseline

# After a rendering change, repeat with the same settings and a different output directory.
PREVIEW_BENCHMARK_DEVICE="local-desktop" pnpm benchmark:3d --repeat-each=3 --output=../../codex-work/benchmarks/candidate

pnpm benchmark:3d:compare codex-work/benchmarks/baseline codex-work/benchmarks/candidate

# A targeted investigation; both comparison runs must select the same cases.
pnpm benchmark:3d --project=chromium --grep 50-sparse
```

The default command runs ten generated cases in each browser: blank, sparse and full 50×50, 100×100 and 256×256 boards, plus a narrow 17×100 sparse board. A single worker avoids concurrent benchmark contention. Retries, tracing, video and automatic failure screenshots are disabled. `--headed` is available for a different experiment, but do not compare headed and headless reports. An explicitly unavailable WebGL context fails the benchmark rather than producing a successful zero-work result.

Each case has a 15-minute completion ceiling because dense boards on software WebGL can spend minutes executing the full interaction protocol. This is a harness deadline, not an accepted product latency. An interrupted case produces no successful metrics report; investigate it and rerun explicitly. Ordinary browser tests keep their existing timeouts.

Each case fixes a 1440×1000 viewport and DPR 1, opens the preview three times, resets/fits, zooms in three steps, and executes 24 steps each of orbit, pan and wheel zoom through real browser input. The two reopens use the same page/module cache but fresh WebGL contexts. Every cycle checks idle draw counts, context release and zero remaining live handles. Draft, 2D viewport and CSV contents must survive unchanged. Ordinary preview tests additionally cover history and context-loss recovery.

The first repeat of the 50-sparse and 256-full cases saves fitted/close-up images to `codex-work/screenshots/issue-95-*.png`. These are manual review artifacts, not screenshot expectations. They are overwritten by a later run of the same browser/case. Rename or copy wanted comparisons before rerunning. Each test writes `metrics.json` in its output directory and attaches it to the Playwright result.

## What the metrics mean

| Metric                         | Boundary and interpretation                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openings[].readyMs`           | Browser click capture to the preview's ready-state DOM update. Includes module/context/shader work for that opening. It is not GPU completion or first screen presentation.                                                                                 |
| First-session vs warm openings | A fresh browser context/page versus two reopens in that page. Driver/OS caches are not forcibly cleared, so “first session” does not imply cold hardware caches.                                                                                            |
| `cpuCallbackMs`                | Wall time of a requestAnimationFrame callback that submitted preview draws, including probe overhead. Includes JavaScript/driver stalls; does not measure GPU execution.                                                                                    |
| `cpuTaskTailMs`                | Non-RAF work from the first observed viewport/draw until its microtask boundary. Explicitly separate from full RAF callback CPU time.                                                                                                                       |
| `inputToSubmitMs`              | Latest canvas pointer/wheel event capture to completion of a draw-containing callback/task scope. Includes event/RAF wait and CPU submission; not input-to-display latency.                                                                                 |
| `gpuCommandRangeMs`            | Optional WebGL2 timer query from the first observed viewport/draw to the end of its scope. Includes commands in that range, not work before it. Does not call `finish()` or force a readback.                                                               |
| `submittedFrameIntervalMs`     | Intervals between recorded draw-containing scopes during a phase. Includes Playwright transport/input pacing and deliberate frame synchronization. Never convert this to a claimed free-running FPS.                                                        |
| Draws/triangles                | Actual native draw submissions, including instance multiplication, indexed/unindexed triangles and triangle strips/fans. Not visible-pixel or post-occlusion counts.                                                                                        |
| Viewports/allocations          | Observed framebuffer target IDs, viewport sizes and numeric texture/renderbuffer storage requests. Allocation events are not a live texture inventory or byte-accurate VRAM usage. Source-object texture uploads are not included in allocation dimensions. |
| Resources                      | Native buffer/texture/framebuffer/renderbuffer/program/shader/VAO creates, explicit deletes, peak/live handle counts and handles reclaimed on context loss. Instrumentation-owned GPU queries are excluded.                                                 |
| Lifecycle snapshots            | Resource state immediately after each opening and after each close, alongside final per-context totals. Reclaimed handles are reported separately from explicit disposal.                                                                                   |

GPU results stay null when the extension is unavailable or results are pending, disjoint, lost or beyond the bounded pending-query capacity. Null is not zero and cannot support a GPU-performance claim. Pending queries are drained opportunistically without an independent polling/render loop; context loss discards unresolved results. Captured scopes and contexts have bounded lifetime within a benchmark page; sample capture fails rather than silently truncating beyond 10,000 scopes.

Reports include browser/version, user agent, the runner's OS/CPU/RAM, optional device note, renderer string, headless/emulation flags, viewport/DPR, actual preview framebuffer, source revision and dirty state. Renderer strings can be masked; explicitly identify software backends such as SwiftShader in any published conclusion. Runner hardware metadata alone does not prove that a browser used that GPU. Physical phones are not exercised by this desktop harness.

The probe wraps native methods and delegates the real calls. The wrapper, timer polling and snapshots have overhead. Treat reports as instrumented comparisons; external browser/GPU profiling is still needed to attribute a bottleneck precisely. The harness does not replace screen-presentation or physical-device measurements. Future multi-draw/compute rendering paths need corresponding instrumentation before this protocol can measure them accurately.

Change the report's `protocol` identifier when changing fixtures, camera/input sequences, synchronization or measurement boundaries. Bump `schema` for incompatible report-shape changes. Capture a new baseline after either change; matching scenario names alone do not establish comparable work.

## Comparison budgets

Use at least three independently repeated cases on each revision. The comparison tool rejects different scenario/browser coverage, environments, framebuffer sizes, protocols, mixed revisions within a run, duplicate repeat indices, missing phases and failed invariants. Filtered runs are valid comparisons of that subset only; they do not establish maximum-board or complete-browser coverage.

Every report in one input directory must share the same source revision and dirty state, across all scenarios and browsers. Baseline and candidate directories may use different revisions. Keep reruns from another revision in a separate directory; matching each individual case is insufficient to establish a single-revision baseline.

For each case, the output shows the distribution across repeats of startup, per-phase CPU/GPU P95, input-to-submission P95, automation-paced submission interval P95, maximum draw/triangle counts and peak resource handles. Paced intervals can expose slow end-to-end runs but include transport/synchronization overhead; a change needs profiling before attributing it to rendering. The observed baseline maximum defines a descriptive same-device repeat envelope. `aboveBaselineRange` flags a candidate median outside that envelope for investigation; it is not a statistical significance test or an automatic rejection. `repeatEvidence: false` means the minimum repeat evidence is missing. GPU-null comparisons remain inconclusive.

Budget decisions for later PRs must cite this evidence: retain zero idle draws and zero live handles after close, bound geometry/framebuffer/effect resources, and explain any startup/interaction increase outside the repeated baseline range in terms of the intended visual gain. Recheck suspicious changes in an interleaved baseline/candidate/baseline experiment under matched conditions. Do not invent a universal percentage or FPS allowance from one run, and do not impose unstable timing thresholds on shared CI.

## Initial local baseline — 2026-09-29

The production renderer was unchanged from `076e3b6`; reports record that revision with a dirty worktree containing this benchmark. Host: Darwin 27.0.0 arm64, Apple M4 Pro, 12 CPUs, 48 GiB RAM. Both browsers ran headless, without mobile emulation, at DPR 1 and a 1440×1000 viewport; the actual preview framebuffer was 1198×758. Chromium 153.0.8010.12 reported ANGLE/Vulkan **SwiftShader software rendering**. WebKit 26.6 reported **Apple GPU**. Neither exposed the timer extension, so GPU timings and the supported-query path remain unverified. Physical-phone evidence is unavailable.

All ten scenarios completed in both browsers. The original three-minute harness ceiling interrupted Chromium's 256-full case during wheel zoom; an explicit rerun with the longer completion ceiling passed in about 4.3 minutes. No timing assertion was relaxed. Other cases completed under the original ceiling. All completed cases passed idle, release, draft and CSV checks.

Three additional independent repeats of 50-sparse in each browser established this small local repeat envelope. Values are milliseconds; ranges cover those three repeats (six openings for the warm column). These are observations, not release thresholds.

| Browser/backend        | First-session ready | Warm openings | Orbit CPU P95 | Pan CPU P95 | Zoom CPU P95 | Paced orbit interval P95 |
| ---------------------- | ------------------- | ------------- | ------------- | ----------- | ------------ | ------------------------ |
| Chromium / SwiftShader | 80.6–81.5           | 62.1–65.0     | 0.2–0.3       | 0.3         | 0.3          | 100.1–101.0              |
| WebKit / Apple GPU     | 55–57               | 28–53         | 1–2           | 2           | 1            | 18–20                    |

The single completed 256-full measurements illustrate why CPU submission alone cannot establish interactive performance:

| Browser/backend        | First-session ready | Warm openings | Orbit CPU P95 | Paced orbit interval P95 |
| ---------------------- | ------------------- | ------------- | ------------- | ------------------------ |
| Chromium / SwiftShader | 122                 | 85.4–89       | 0.2           | 3366.5                   |
| WebKit / Apple GPU     | 86                  | 64–75         | 2             | 17                       |

Earlier single-run 50-sparse startup readings were 262.3 ms in Chromium and 58 ms in WebKit, versus the narrower later repeat ranges. Browser/driver caching and uncontrolled machine conditions can change observations despite matching metadata. Re-establish the envelope in the session used for a candidate comparison; these initial numbers do not isolate a rendering bottleneck. The full matrix supplies coverage, but only 50-sparse has repeated timing evidence here. Repeat every affected size/fill case before claiming an improvement, especially 256-full.

Both representative nonempty cases submitted four draws per interaction callback: 194,668 triangles for 50-sparse and 9,530,388 for 256-full. Peak handles per context were 16 buffers, 5 textures, 3 framebuffers, 4 programs, 2 simultaneously live shaders and 4 vertex arrays. All handles were gone after each close. Textures/framebuffers were reclaimed with context loss; buffers/programs/shaders/VAOs were explicitly deleted. Allocation events included 1×1 defaults and a 16×16 texture, with no observed large offscreen target. These handle counts are not a VRAM estimate.

Raw local artifacts are retained in `codex-work/benchmarks/issue-95-matrix/` (including the explicit `slow-case/` rerun) and `codex-work/benchmarks/issue-95-repeats/`. The eight fitted/close-up screenshots in `codex-work/screenshots/issue-95-*.png` were visually inspected. The dense distant board retains visible aliasing; these images establish the current appearance for later geometry/lighting comparisons. Generated artifacts are ignored by Git; rerun the commands above to produce your own evidence.

## Validation

```sh
pnpm --filter @my-beads/web test preview-benchmark.test.ts
pnpm test:e2e preview-benchmark.spec.ts preview-3d.spec.ts preview-rendering.spec.ts --workers 2 --retries 0
```

The repository's format/lint/typecheck/package tests/build and production smoke commands still apply. No `templates/` files are used by the benchmark or its tests.

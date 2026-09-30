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

## Environment lighting comparison — 2026-09-30

Issue #96 compares the unchanged `103642a` renderer with the environment-lighting
worktree on the same host/browsers/viewport described above. The probe, fixtures
and input protocol are unchanged. Three independent 50-sparse repeats per browser
were captured for each version, with no simultaneous test/build workload.

| Median across three reports  | Chromium / SwiftShader, before → after | WebKit / Apple GPU, before → after |
| ---------------------------- | -------------------------------------- | ---------------------------------- |
| First-session ready          | 79.5 → 157.7 ms                        | 53 → 74 ms                         |
| Per-report warm-ready median | 62.6 → 127.9 ms                        | 32 → 43 ms                         |
| Orbit CPU P95                | 0.3 → 0.3 ms                           | 2 → 1 ms                           |
| Paced orbit interval P95     | 100.4 → 117.3 ms                       | 17 → 17 ms                         |

Environment generation runs during initialization, outside steady camera RAF
callbacks. Its draw-containing initialization task tail was 34.8–35.9 ms in
Chromium and 23–24 ms in WebKit on first opening. This boundary starts at the first
observed viewport and includes surrounding initialization; it is not isolated
PMREM CPU time or GPU execution time. Baseline initialization has no offscreen
draws, so that task-tail metric is absent rather than zero. Full startup includes
additional shader work and is reported separately above.

A separate browser diagnostic timed the actual `createPreviewEnvironment` call,
including room creation, PMREM submission and temporary cleanup, after module and
renderer creation. Three fresh contexts in one page measured 30.8/21.2/22.1 ms
in Chromium and 24/16/15 ms in WebKit. This development-module diagnostic excludes
the first visible scene render, uses no GPU fence and is CPU elapsed time only;
the production startup figures above remain the end-to-end comparison.

This is an appearance/performance tradeoff, not a speed improvement. WebKit's
one-millisecond CPU differences are below useful attribution precision. Software
Chromium showed a repeatable extra paced interval and startup cost. No GPU timer
or physical-phone result is available. Repeated measurements cover 50-sparse only;
do not extrapolate the numbers to maximum grids or all hardware.

The complete candidate matrix passed all 20 browser/scenario combinations and
60 open/close cycles. Its single 256-full case reported 180.3 ms first-session
ready and 3550.6 ms paced orbit P95 in software Chromium, versus 115 ms and 17 ms
in WebKit. Both still submit four draws and 9,530,388 triangles per interaction.
The Chromium case took about 4.3 minutes to execute the full protocol. These are
coverage observations, not repeated large-board performance evidence. Automated
comparison with the older #95 matrix was correctly rejected because its device
note differs; no metadata was rewritten to force acceptance. The before/after
table uses the fresh, compatible 50-sparse reports instead.

Manual black/white/green/blue/red/orange comparisons in both themes favored
environment intensity 0.35 with white key/fill intensities 1.3/0.25. The initial
brighter setting lost white-bead surface detail. Both 64- and 128-pixel environment
faces were inspected; 128 did not provide a useful visible improvement at the
unchanged bead roughness of 0.48, so 64 was retained. Its atlas is 336 × 256 rather
than 384 × 512. Dark beads gain broad neutral highlights; holes and counting guides
remain visible. Tone mapping and contact shadows remain separate work.

In the repeated nonempty case, peak textures/framebuffers increase from 5/3 to
7/5 during generation. After initialization, 6 textures, 4 framebuffers and one
renderbuffer remain, including the retained environment target and its depth
attachment. Live scene buffers/programs/VAOs stay at 16/4/4; temporary room and
filtering resources are disposed before interaction. Both environment textures
and framebuffers plus the depth renderbuffer are explicitly deleted by close;
the same renderer-owned defaults as before are reclaimed by context loss. All
live handles reach zero. The two environment textures and depth allocation are
bounded at 336 × 256, with no regeneration on camera/theme/resize changes.

Reports: `codex-work/benchmarks/issue-96-baseline-repeats/`,
`issue-96-candidate-repeats/` and `issue-96-candidate-matrix/`. Compare the two repeat
directories with the existing comparison command. The candidate matrix also
passes the comparator's standalone completeness/consistency checks via an identity
comparison.
Manual color-strip screenshots are `codex-work/screenshots/issue-96-baseline-*.png`,
`issue-96-balanced64-*.png` and `issue-96-balanced128-*.png`; fitted/close-up sparse
and maximum-board views are `issue-96-{chromium,webkit}-{50-sparse,256-full}-*.png`.
The preview lazy chunk
grows by about 4.82 kB raw / 1.17 kB gzip, with no new package or remote asset.

## Neutral output comparison — 2026-09-30

Issue #97 uses the merged environment-lighting renderer at `d2aa0aa` as its
baseline. The selected policy is `NeutralToneMapping` at exposure 1.1 when an
environment is available, with explicit sRGB output. The direct-only capability
fallback retains `NoToneMapping` and exposure 1. Unlit counting marks bypass tone
mapping, and the solid theme backgrounds keep their clear-color output path.

Generated H7/H5/H4/H2/B15/D22/F13/A7 strips were compared in both browsers/themes
at fitted and close views, with both lighting paths. Exposures 0.9, 1, 1.1 and 1.5
were inspected. Neutral increases saturation and darkens the darkest surfaces;
1.1 retained more rim/hole detail than 0.9/1 while keeping controlled white
highlights. At 1.5 the board and white surfaces became too bright. The direct-only
rig lost black-hole readability under Neutral, so retaining its original output
was preferable to altering its lights or the palette. This is a visual tradeoff,
not a promise that shaded pixels equal unlit swatches. Background/guide colors
are checked with native framebuffer reads; these tests have no screenshot baseline.

Screenshots are under `codex-work/screenshots/issue-97-{baseline,neutral09,neutral1,neutral11,neutral15,final}-*.png`.
Whole-canvas element screenshots include the floating controls; their white-pixel
counts must not be interpreted as scene-highlight clipping measurements.

Fresh baseline/candidate runs used the unchanged protocol on the same M4 Pro,
headless browsers, 1440 × 1000 viewport, DPR 1 and 1198 × 758 framebuffer as above,
with `PREVIEW_BENCHMARK_DEVICE=local-m4-pro`. Each selected case has three repeats,
with no concurrent test/build workload. Both comparison commands passed.

| Case / backend                   | First-session ready, before → after | Per-report warm median, before → after | Paced orbit P95, before → after |
| -------------------------------- | ----------------------------------- | -------------------------------------- | ------------------------------- |
| 50-sparse / Chromium SwiftShader | 160.1 → 166 ms                      | 134.2 → 136.5 ms                       | 117 → 117.1 ms                  |
| 50-sparse / WebKit Apple GPU     | 75 → 78 ms                          | 48.5 → 49 ms                           | 17 → 18 ms                      |
| 256-full / WebKit Apple GPU      | 104 → 110 ms                        | 76.5 → 75.5 ms                         | 17 → 18 ms                      |

Values are medians across the three reports. The first-opening draw-containing
RAF CPU P95 medians changed from 74.5 to 83.2 ms, 18 to 20 ms and 27 to 29 ms,
respectively. That callback includes first-visible-render shader work and driver
submission, not isolated shader compilation or GPU completion. Orbit CPU P95
stayed 0.3 ms in software Chromium; WebKit's 1–2 ms readings are too coarse to
claim an improvement. The small startup cost buys the selected output appearance;
paced intervals include automation and must not be converted to displayed FPS.

Visible draws/triangles remain four / 194,668 for 50-sparse and four / 9,530,388
for 256-full. The observed per-context resource counts match the baseline:
peak textures/framebuffers 7/5, live after opening 6/4 plus one depth renderbuffer,
and four live programs. Tone mapping adds no allocation or render pass. Idle draws
remain zero and all native handles are released on close. Additional single-run
50-blank, 50-full and 17×100-sparse cases cover both browsers; these are behavioral
coverage rather than repeated performance comparisons.

Raw reports: `codex-work/benchmarks/issue-97-{baseline,candidate}-small/` and
`issue-97-{baseline,candidate}-large/`; compare each matching pair with
`pnpm benchmark:3d:compare`. Extra cases are in `issue-97-candidate-edges/`.
The preview lazy chunk grew by about 0.08 kB raw / 0.03 kB gzip.
No maximum-grid software-Chromium comparison, physical-phone run or native GPU
timer result was produced for this slice. Do not extend the measured results to
those cases or to the complete matrix.

## Static contact shading comparison — 2026-09-30

Issue #98 uses the merged Neutral-output renderer at `d09dc96` as its baseline.
Two generated red-channel visibility maps add shape-local cavity/base shading and
an occupancy-aware board contact field. Counting marks now receive the same light,
tone mapping and board AO as the slab, superseding the unlit-guide policy recorded
above. Lights, exposure, palette data, mesh positions and instance counts stay the
same. This is approximate indirect occlusion, not neighbor-aware bead shading or
directional shadows.

Matched H7/H5/H4/H2/B15/D22/F13/A7 strips, sparse corner contacts, a dense patch and
a narrow board were inspected in Chromium/WebKit, both themes and both lighting
paths, at fitted and close views. Contacts gain soft grounding and cavities gain
depth while upper rims, peg tops and physical holes remain readable. Unrelated
empty areas stay clear, and markings no longer act as unlit overlays. The contact
field caps its darkness rather than accumulating contributions from every neighbor.

Fresh runs used the unchanged protocol, M4 Pro host, headless browsers,
1440 × 1000 viewport, DPR 1, 1198 × 758 framebuffer and
`PREVIEW_BENCHMARK_DEVICE=local-m4-pro`, without concurrent builds/tests.
Each selected case has three reports. Both baseline/candidate comparisons passed.

| Case / backend                   | First-session ready, before → after | Per-report warm median, before → after | Paced orbit P95, before → after |
| -------------------------------- | ----------------------------------- | -------------------------------------- | ------------------------------- |
| 50-sparse / Chromium SwiftShader | 164.5 → 140.7 ms                    | 130.95 → 120.8 ms                      | 117.5 → 117.1 ms                |
| 50-sparse / WebKit Apple GPU     | 72 → 75 ms                          | 47 → 47.5 ms                           | 17 → 17 ms                      |
| 256-full / WebKit Apple GPU      | 110 → 120 ms                        | 75 → 86 ms                             | 17 → 17 ms                      |

Values are medians across three reports. First-opening draw-containing RAF CPU
P95 medians changed from 82.8 to 58.3 ms, 19 to 19 ms and 28 to 28 ms, respectively.
Orbit CPU P95 medians changed from 0.3 to 0.3 ms, 2 to 1 ms and 2 to 2 ms.
WebKit startup reflects a modest added cost; the software-Chromium reduction does
not establish a general speedup or isolate the effect of shader sharing. These
instrumented CPU submissions and paced frame intervals do not measure GPU
completion or displayed FPS. Neither backend exposed native GPU timer results.

Visible draws/triangles stay four / 194,668 for 50-sparse and four / 9,530,388 for
256-full. In these nonempty scenes, live textures increase from 6 to 8 and buffers
from 16 to 21. The two maps add no framebuffer, renderbuffer, mesh or render pass;
live framebuffers/renderbuffers stay 4/1. Live programs decrease from 4 to 3 because
the board and lit guides share a standard-material program. Peak textures rise
from 7 to 8; peak framebuffers remain 5. The board map is 1820 × 1820 for a full
256 × 256 document, with mipmaps, and the shared local map is 16 × 32 without them.
The density rule bounds either map axis at 2048, including other document sizes.

Idle draws remain zero, draft/CSV bytes are unchanged, and all native handles reach
zero after close. The maps are explicitly deleted, while renderer-owned defaults
are reclaimed by context loss as before. Browser tests additionally verify no map
re-upload during camera/theme/resize changes, cleanup after a mipmap initialization
failure and successful reopening. Single-run 50-blank, 50-full and 17×100-sparse
cases passed in both browsers; these provide coverage, not repeated timing evidence.

A single candidate 256-full run also completed in software Chromium, including
three opens and cleanup (4.4 minutes for the whole test). Its first-ready value was
174.4 ms, warm median 154.85 ms, and paced orbit P95 3533.2 ms. The fast readiness
callback does not imply fast presentation: this software backend remains very slow
at maximum geometry. No fresh repeated maximum-Chromium baseline was captured, so
this establishes coverage only, not a before/after performance conclusion.

Raw reports are in `codex-work/benchmarks/issue-98-{baseline,candidate}-small/`,
`issue-98-{baseline,candidate}-large/`, `issue-98-candidate-edges/` and
`issue-98-candidate-software-large/`. Compare the
matching small and large pairs with `pnpm benchmark:3d:compare`.
Manual matched screenshots are `codex-work/screenshots/issue-98-{baseline,candidate}-*.png`;
benchmark fitted/close views are preserved as `issue-98-final-*.png` in that directory.
The preview lazy chunk grows by about 2.00 kB raw / 0.72 kB gzip. No new package,
network asset, physical-phone measurement or full repeated browser/scenario matrix
is included in this slice.

## Validation

```sh
pnpm --filter @my-beads/web test preview-benchmark.test.ts
pnpm test:e2e preview-benchmark.spec.ts preview-environment.spec.ts preview-output.spec.ts preview-occlusion.spec.ts preview-3d.spec.ts preview-rendering.spec.ts --workers 2 --retries 0
```

The repository's format/lint/typecheck/package tests/build and production smoke commands still apply. No `templates/` files are used by the benchmark or its tests.

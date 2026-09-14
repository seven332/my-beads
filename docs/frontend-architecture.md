# Frontend architecture

The editor is planned in [#6](https://github.com/seven332/my-beads/issues/6).
The shared core and ccstate/Snabbdom CSV editor are implemented in #7 and
[#8](https://github.com/seven332/my-beads/issues/8). Image import and draft recovery
complete the final delivery slice in [#9](https://github.com/seven332/my-beads/issues/9).

## Boundaries

- `packages/core` owns pure palette, grid, CSV, color matching and SVG logic. A document
  is a rectangular array of MARD codes or `null`; derived cells and bead counts come
  from `createPattern`. Blank documents are valid; initialize every cell explicitly
  with a color or `null`, since sparse rows and cells are rejected. Treat returned
  grids as immutable. Chart rendering accepts integer widths from 800 to 10000 pixels,
  with a minimum of `columns * max(20, digits(columns) * 8) + 250` for readable cells
  and separated multi-digit coordinates.
- The browser app owns ccstate, Snabbdom views, Canvas interaction, file decoding,
  downloads and storage. It imports the core without Node polyfills.
- `apps/cli` owns filesystem paths, system fonts, macOS sips and native resvg.
  Browser code must never import these adapters.

## State and commands

These conventions adapt the ccstate documentation and lint guidance in vm0's
`turbo/apps/platform` and `turbo/packages/eslint-rules/src/ccstate`. They do not
introduce a dependency on that checkout or its private rule package.

- Use `$` suffixes for ccstate units. Keep writable state private and expose computed
  reads plus semantic commands such as painting a cell or replacing a document.
- Declare the state graph and commands outside view rendering and command execution.
  Calling an existing subcommand is allowed; constructing a new `command()` inside
  another command is not.
- Keep `get` and `set` within their ccstate scope. Do not retain accessors in event
  callbacks, pass them into generic helpers, or pass the entire Store through utilities.
- Keep parsing, flood fill and other transformations pure. Derive counts and
  selections with computed values; avoid an additional mutable cache for derived data.
- A view reads state and dispatches intent. It does not mutate the document directly.

Palette search derives from its query in a separate computed unit, so drawing and
viewport updates reuse the current results. The pure browser search helper resolves
exact codes before complete three/six-digit hex values, then falls back to partial
text filtering. Exact palette hex matches bypass approximation; other complete hex
values reuse both core matching policies and combine duplicate codes with both rule
labels. The view compares the source swatch and explained suggestions. Only explicit
color selection dispatches the existing color command; search does not change the
document, selected color or history. No search results are persisted.

## Lifecycle and asynchronous work

The application mount owns its root cancellation lifetime. Adapt Snabbdom's
insert/destroy hooks for Canvas setup and disposal, retain the vnode returned by
patch, and keep the Canvas keyed so unrelated UI updates preserve its element.

Async commands take their owning AbortSignal as the final argument. Pass it to
cancellable APIs; after noncancellable awaits, check `signal.throwIfAborted()`
before writing state. Preserve cancellation instead of displaying it as a failure.
Replacing an import or unmounting the app must prevent stale work from committing.

Listeners, observers, animation frames, subscriptions and object URLs need explicit
owners and cleanup. Put raw AbortController creation in the small lifecycle adapter.
Do not copy vm0's application-specific fetch, authentication or React rules.

## Tests and lint

Core unit tests cover document transformations and mathematical contracts. Editor
tests should mount the real application, perform one user action, and assert the
observable result before the next action. Use a fresh store and owned cleanup for
each test. Await completion or visible state instead of sleeps or repeated actions.
Prefer behavior and exported-content assertions over screenshot comparisons. For
printable layout, inspect the actual downloaded SVG in both browsers and check text
bounds, legend contents and coordinate spacing with the production system fonts.
Keep screenshots for manual review under `codex-work/screenshots/`.

`packages/eslint-rules` enforces private state exports, dollar suffixes, accessor
scope, command construction and asynchronous ownership with valid/invalid examples.
These are focused syntax checks, not a proof of runtime cancellation. The lifecycle
adapter in `app.ts` owns AbortControllers; state commands check cancellation after
awaits. The web graph is declared in `state.ts` and `image-state.ts` and reused
with isolated stores.

Each drag records its starting grid and commits one history entry on pointerup.
Capture loss with no buttons pressed also commits, since Chrome may deliver it
before pointerup. Capture loss while pressed and explicit pointer cancellation
restore the starting grid; no-op gestures preserve redo. At most 100
snapshots are retained, sharing unchanged rows. The Canvas draws only visible cells
into a viewport-sized backing buffer and batches redraws with animation frames.
Local cursor movement also schedules a frame when the document and selected color
stay unchanged, such as picking the same color or filling an already matching region.
Counts come from computed core data. Imports use both an owned AbortSignal and
revision/token checks, so newer work cannot be overwritten by a late file read.

The root watch patches one retained vnode; the keyed Canvas insert/destroy hooks
own pointer listeners, ResizeObserver and animation frames. Mount destruction aborts
the watch and file work, removes listeners and revokes pending download URLs.
CI covers real bootstrap/teardown, state isolation, Chromium/WebKit editing and
decoded downloads, alongside the existing core and CLI regression suites.

## Editor workspace layout

`editor-view.ts` owns the editing surface separately from the scrollable creation
page. The edit workspace is fixed to the dynamic viewport; an absolute Canvas fills
it behind a CSS Grid of stationary floating controls. Grid rows account for actual
header and status heights, including draft warnings. On narrow or short windows,
one bottom dock groups drawing/history and navigation, and statistics sit below
the header as plain text. The dock uses `display: contents` on desktop to retain
the separate tool and navigation placements without duplicate controls. Transparent space between
panels passes pointer events through to the Canvas. Palette content uses contained
scrolling, including its recommendations and the whole panel in short windows.

`canvas-viewport.ts` measures visible panels and their CSS `--canvas-edge` values to
derive a central unobscured rectangle in Canvas coordinates. Fit receives this area
and its origin; button zoom uses its center, while wheel zoom retains its pointer
anchor. Narrow-screen Fit closes the palette first. Palette visibility is transient
ccstate UI state; normal toggles and viewport resizing do not refit or change history.
The Canvas keeps its existing pointer capture and continuous-stroke behavior when
an active gesture crosses a panel. Panels have no dragging or saved positions.

Browser tests check the full-window bounds, unobscured fitted grid, actual control
hit targets, palette scrolling/selection and focus, short-window recovery warnings,
and Canvas pixels. Geometry tests cover offset canvases and obscured/empty areas;
existing creation, capture, editing and export workflows remain regression coverage.

## Image imports and drafts

`state.ts` owns the create/edit page and whether a document has been explicitly
created or recovered. Fresh visits show `create-view.ts`; a valid draft resumes
editing. All three creation paths share the validated document replacement boundary,
which switches to editing only after success. Opening creation leaves the committed
document, history and viewport intact. The Canvas unmounts while creation is visible
and remounts on return; language changes and export dialogs retain its DOM node.
The mount cancels pending imports when starting another source or continuing the
current document. CSV settings never depend on the blank-canvas form or image mapping.

Export is an editor action, not a separate page. `export-state.ts` retains dialog
format/size choices and pending status; `export-view.ts` shows only the selected
format's settings. Native dialog focus and Escape return to the editor. History
shortcuts are suspended outside the editor or inside either dialog. The mount owns
each export AbortController so closing the dialog or unmounting prevents a late
download. Workflow navigation is not persisted; the existing document-only draft
schema remains unchanged.

`image-file.ts` owns local PNG/WebP decoding, image events, cancellation and object
URLs. It checks compressed size and decoded dimensions before Canvas allocation;
only RGBA data leaves the adapter. Core `image-import.ts` samples cell centers,
applies the alpha rule, counts source colors and reuses the shared color matcher.
Manual overrides reserve candidates for distinct assignment. Sampling, source-color
and raster limits bound the work; general photo quantization is not implicit.

`image-state.ts` owns a separate preview session and its original document revision.
Its async command accepts an image-source IO boundary and an AbortSignal. A new
CSV/image import or grid cancels the mount's previous import owner. Apply also
checks the revision and live-stroke state; canceled or stale work never replaces
the document. Changed form settings disable Apply until the preview is refreshed.
The native dialog owns focus and Escape. Editor undo/redo shortcuts are suspended
while an image session is open; native text editing inside its controls remains available.
Preview Canvases are independent of the stable editor Canvas. Shared MARD
suggestions avoid duplicating the full palette for every mapping row.

`drafts.ts` owns one version-1 localStorage record containing grid and title.
Recovery validates size, shape, version and exact palette codes before state changes.
The committed-document selector uses a live stroke's starting grid. A readonly
watch supplies snapshots to the adapter, which coalesces saves in a microtask and
reports results outside that watch. Unchanged initial state, navigation and previews
do not cause writes. The mount flushes committed work on pagehide/teardown and
disposes pending work and listeners. Failed recovery pauses saving without deleting
the original bytes; replacement and retry are explicit user actions.

Tests inject storage/decoder boundaries for deterministic failures and late results;
they mount the real app and state graph. jsdom lacks native dialog methods, so DOM
tests adapt those methods while Chromium/WebKit exercise actual dialogs, image
decoding, storage, reloads and exported contents. No screenshot baseline is required.

## Interface languages

The web app follows vm0's i18next, JSON resource and typed-selector approach,
adapted to Snabbdom. English (`en-US`) and Simplified Chinese (`zh-CN`) are bundled
statically and initialized before mounting. The English brand is My Beads; the
Chinese brand is 我来拼豆. No React binding, translation backend or runtime fetch
is needed. `locale.ts` owns a private language atom, readonly locale/translator
selectors and a semantic selection command. Fixed translators avoid a mutable
global language shared between stores. Views receive the translator explicitly.

The mount reads the separate `my-beads.locale` preference before its first render.
A supported saved choice wins; otherwise the first English or Chinese browser
language is used, with English as the final fallback. Chinese variants resolve to
Simplified Chinese. Manual selection updates the HTML language and page title and
persists the preference when storage allows. Preference failures leave switching
and editing usable. Locale changes never rename document data, replace the Canvas,
reset history or alter draft bytes; the default document title remains English.
CSV and pixel exports are unchanged, and printable chart labels stay English.

UI copy, accessible names and known validation errors belong in both catalogs.
Use typed selectors (`t($ => $.app.name)`) and i18next plural/count formatting;
do not translate when storing an error or concatenate language-specific sentences.
Core `BeadError` codes and interpolation values preserve English CLI messages
without depending on the web app. Browser errors and draft statuses also keep
their identity until presentation, allowing existing alerts to change language.
Unknown browser/IO diagnostics retain their original detail inside a translated
message. Snabbdom renders translations and interpolated user values as text.

`pnpm lint` validates catalog keys, nonempty values, interpolation placeholders and
locale-specific plural forms. TypeScript checks selector keys. Package-local tests
cover language resolution/persistence, independent stores, preserved editing and
form state, retranslated errors and unchanged draft recovery. Chromium/WebKit
tests cover Chinese image import, English exports, reloads and responsive layouts.

The web-only ESLint rule `ccstate/no-hardcoded-ui-text` checks Snabbdom child text,
visible attributes (including accessible names, placeholders and tooltips), local
rendering-helper arguments, DOM text assignments and browser error messages. It
follows local constants, aliases, destructuring, conditional/template expressions,
return values and common array/object mappings, including local object and array
spreads. It resolves imported `h` bindings, so aliases work and unrelated or
shadowed functions are not treated as Snabbdom.
There is no exemption for a function merely named `t`.

Use `h("button", t($ => $.export.download))` instead of `h("button", "Download")`.
For an imported helper, list its module, export name and text-argument indexes in
`textFunctions` in the ESLint config; `imagePicker` is registered this way. Keep
literal exceptions exact and explained: palette codes come from the actual MARD
catalog, while format names, language names and keyboard identifiers are listed
explicitly. Icons, numbers and complete hex colors are also allowed. Do not add a
broad pattern exemption for English words or all uppercase strings.

This is static, file-local analysis, not a proof for arbitrary JavaScript. Unknown
imported values, runtime user data and unsupported dynamic transformations are not
traced across modules. Review new UI data sources and helper boundaries. The rule
does not inspect catalog JSON, CLI/chart output or test fixtures. RuleTester cases
and a test against the repository's actual ESLint config verify both enforcement
and exclusions; these run in the existing CI package-test job.

## Static deployment

Vite emits relative asset URLs so the same `apps/web/dist` artifact works at a
domain root or repository subpath. `pnpm test:production` builds it, then starts
an owned preview server under `/my-beads/` on port 4174 with no server reuse.
Package-local Chromium/WebKit smoke tests validate asset paths, editing/export
and draft recovery without a development server or screenshot baseline. The
existing Checks browser job runs this alongside the full development workflows.

`pages.yml` filters main pushes by declared web/core/build inputs and also allows
main-only manual runs. Shared dependency files trigger conservatively; this is
path filtering rather than a byte-equivalence check. A read-only build job validates
the artifact before uploading only `apps/web/dist`. A dependent deployment job
owns Pages/OIDC permissions and the `github-pages` environment. Main runs share a
concurrency group without canceling the active deployment; rejected manual runs
use separate groups so they cannot displace a queued main update. Keep the
workflow path list current when adding build inputs. Hosting changes neither the
browser-only IO boundary nor the origin-scoped draft schema.

# Frontend architecture

The editor is planned in [#6](https://github.com/seven332/my-beads/issues/6).
The shared core and ccstate/Snabbdom CSV editor are implemented in #7 and
[#8](https://github.com/seven332/my-beads/issues/8), followed by image import
and draft recovery in [#9](https://github.com/seven332/my-beads/issues/9).

## Boundaries

- `packages/core` owns pure palette, grid, CSV, color matching and SVG logic. A document
  is a rectangular array of MARD codes or `null`; derived cells and bead counts come
  from `createPattern`. Blank documents are valid; initialize every cell explicitly
  with a color or `null`, since sparse rows and cells are rejected. Treat returned
  grids as immutable. Chart rendering accepts integer widths from 800 to 10000 pixels,
  with a minimum of `columns * 20 + 250` for readable cells and axes.
- The browser app owns ccstate, Snabbdom views, Canvas interaction, file decoding,
  downloads and storage. It will import the core without Node polyfills.
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

`packages/eslint-rules` enforces private state exports, dollar suffixes, accessor
scope, command construction and asynchronous ownership with valid/invalid examples.
These are focused syntax checks, not a proof of runtime cancellation. The lifecycle
adapter in `app.ts` owns AbortControllers; state commands check cancellation after
awaits. The web graph is declared in `state.ts` and reused with isolated stores.

Each drag records its starting grid and commits one history entry on pointerup.
Cancellation restores the starting grid; no-op gestures preserve redo. At most 100
snapshots are retained, sharing unchanged rows. The Canvas draws only visible cells
into a viewport-sized backing buffer and batches redraws with animation frames.
Counts come from computed core data. Imports use both an owned AbortSignal and
revision/token checks, so newer work cannot be overwritten by a late file read.

The root watch patches one retained vnode; the keyed Canvas insert/destroy hooks
own pointer listeners, ResizeObserver and animation frames. Mount destruction aborts
the watch and file work, removes listeners and revokes pending download URLs.
CI covers real bootstrap/teardown, state isolation, Chromium/WebKit editing and
decoded downloads, alongside the existing core and CLI regression suites.

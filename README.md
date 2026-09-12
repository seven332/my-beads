# My Beads

My personal collection of perler bead patterns. Source images are prepared with AI, refined in an online editor, and converted into printable charts or pixel-art PNGs with TypeScript tools.

All patterns use the **MARD 221** color palette.

## Workflow

1. Process the source image with AI to create a design suitable for perler beads.
2. Import the result into [Perler Beads Generator](https://perlerbeads.zippland.com/), make the final edits, and export the pattern as CSV.
3. Use the tools in this repository to generate the final images.

## Patterns

Pattern files are stored under [`templates/`](templates/) and grouped by theme.

## Color Palette

The built-in palette is based on the [Pixel Beads MARD color chart](https://www.pixel-beads.com/zh/mard-bead-color-chart). It contains the 221 standard colors from series A–H and M.

Palette data is stored in [`packages/core/src/data/mard-221-colors.json`](packages/core/src/data/mard-221-colors.json). Both generators also accept a custom palette with `--palette`.

## Find the Closest Color

Find the MARD 221 color closest to a hex color:

```bash
pnpm match:color "#4c4c40"
```

The command compares colors with CIEDE2000, which measures perceptual color difference. For a visibly tinted input, it searches tinted palette colors so that a dark green or brown is not flattened to a neutral gray. It accepts three-digit and six-digit hex colors, with or without `#`:

```text
Input: #4C4C40
Closest: B23 (#303921)
Delta E: 10.21 (CIEDE2000)
Mode: preserve chroma
```

Use `--include-neutral` to search every palette color using only CIEDE2000; for the example above, that mode returns H5. Use `--palette <path>` to search a custom palette.

Pass several colors with `--unique` to minimize total color difference without reusing a MARD color, while prioritizing the chroma preference. If there are too few tinted candidates, the output identifies a neutral fallback. Use `--series B` when the source colors should remain in MARD's green series:

```bash
pnpm match:color 4D4D3D 35352A --unique --series B
```

## Setup

Install Node.js 24 or newer and pnpm 10.28.1 (pinned in `packageManager`), then install dependencies from the repository root:

```bash
pnpm install --frozen-lockfile
```

## Printable Chart

Generate a print-friendly PNG or SVG:

```bash
pnpm generate templates/<collection>/<pattern>.csv \
  --output codex-work/pattern-chart.png \
  --title "Pattern Title"
```

The chart includes:

- a title and pattern statistics
- coordinates on all four sides
- the MARD code inside every filled cell
- guide lines at five-cell and ten-cell intervals
- a legend with each color code, hex value, and bead count
- a `MARD 221` footer

Use `--width` to set the output width in pixels. The default is `2400`. Charts need at least `max(800, columns × 20 + 250)` pixels to keep cell codes and coordinates readable; an undersized page reports the minimum width. Legend cards wrap into additional rows when needed. Chart text is in English and uses the platform system font, including SF on macOS.

Run the following command to see every option:

```bash
pnpm generate --help
```

## Pixel Art

Generate a PNG directly from the CSV grid:

```bash
pnpm generate:pixel templates/<collection>/<pattern>.csv \
  --output codex-work/pattern-pixel-art.png \
  --scale 20
```

Each CSV cell becomes a square block of pixels. Empty cells remain transparent, and the output contains no labels, guides, or legend. The default scale is `16`; for example, a 50 × 50 pattern at `--scale 20` produces a 1000 × 1000 PNG.

Run the following command to see every option:

```bash
pnpm generate:pixel --help
```

## CSV Format

The input must be a nonempty rectangular CSV grid. CSV supports quoted fields, a UTF-8 BOM, and LF or CRLF line endings. Filled cells may contain either a MARD color code such as `H7` or a hex value found in the selected palette. Blank cells and the values `TRANSPARENT` and `ERASE` are treated as transparent.

The core represents a grid as color codes or `null`. Its CSV writer emits codes and quoted empty cells, preserving fully blank documents, including 1 × 1. The command-line generators require at least one bead. Custom palettes use a JSON `colors` object mapping codes or names to hex colors. Codes are trimmed and uppercased; they must be unique after normalization and cannot be empty, start with `#`, or use the reserved names `TRANSPARENT` and `ERASE`.

When `--output` is omitted, the printable chart uses the suffix `-chart.png` and the pixel-art image uses `-pixel-art.png`.

## Web Editor

Start the local editor from the repository root:

```bash
pnpm dev
```

Open the localhost URL printed by Vite. Use **Open CSV** to load a pattern, or **Start a new pattern** to create a blank grid. Imports are validated before replacing the document; invalid files leave your work intact. All file processing happens in your browser.

- **Pencil / Eraser:** click or drag. Fast drags interpolate cells; one drag is one undo step. Escape or an interrupted pointer gesture cancels the current stroke.
- **Fill:** recolor a four-connected region. **Pick:** select the color of an existing bead.
- **Palette:** search MARD codes or hex values, choose a color, and see per-color counts.
- **Navigate:** use +/− or pinch to zoom around the viewport/pointer; scroll, use Pan, or middle-drag to move the canvas. Fit centers the entire grid. Grid and Codes toggle overlays; codes appear when zoomed in enough to read.
- **Keyboard:** focus the canvas, move with arrow keys and draw with Enter or Space. Shift + arrows pans. Cmd/Ctrl + Z undoes; add Shift to redo.
- **Download:** select CSV, transparent pixel PNG, printable SVG, or printable PNG. Pixel scale is an integer from 1 to 512, including 1×; chart width defaults to 2400. The title is editable. Printable legends keep hex values and bead counts on separate lines and retain the MARD 221 footer.

The editor accepts grids up to 256 × 256, CSV files up to 2 MB and 100 undo steps. PNG exports are limited to 8192 pixels per side and 32 million pixels; SVG avoids the raster limit. Download your work before replacing the document or closing the page. Image import and local draft recovery are tracked in [#9](https://github.com/seven332/my-beads/issues/9).

## Development

This is a pnpm workspace:

- `packages/core`: browser-compatible TypeScript for palettes, code/null grids, CSV, color matching and SVG rendering, with unit tests in `packages/core/tests`.
- `apps/cli`: Node file access, platform fonts and native PNG generation, with real CLI integration tests in `apps/cli/tests`.
- `apps/web`: ccstate commands, Snabbdom controls, Canvas interaction and browser file adapters; unit/DOM tests in `apps/web/tests` and browser tests in `apps/web/e2e`.
- `packages/eslint-rules`: focused ccstate lint conventions and valid/invalid rule tests.

Run the checks from the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @my-beads/web exec playwright install chromium webkit
pnpm test:e2e
pnpm build
```

`pnpm test` runs each package's test script. To test one package, use `pnpm --filter @my-beads/core test` or `pnpm --filter @my-beads/cli test`.

The core has a separate typecheck without Node or DOM globals. Its build emits a browser ESM bundle and type declarations under `packages/core/dist/`; the private workspace package exports TypeScript source for tsx and Vite. The web production build is in `apps/web/dist/`. TypeScript 6.0.3 is pinned within the supported range of the ESLint TypeScript parser.

CI runs lint, types, tests and production builds on Linux/macOS, plus Chromium/WebKit workflows on Linux. Tests cover CSV round trips, color matching, grouped editing history, state isolation, cancellation, real application bootstrap/teardown and decoded export colors/alpha. CLI pixel regression checks 1× and 20×; browser checks 1× and 3×. The printable-chart visual baseline uses bundled Roboto Mono in Chromium and is separate from the app's system fonts. Review any intentional baseline change with `pnpm --filter @my-beads/web test:e2e --project chromium --update-snapshots`; do not update snapshots to conceal a layout failure.

The complete web editor is tracked in [#6](https://github.com/seven332/my-beads/issues/6). See [frontend architecture](docs/frontend-architecture.md) for state, lifecycle and testing conventions.

Commit messages follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).

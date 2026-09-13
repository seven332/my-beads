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

Use `--width` to set the output width in pixels. The default is `2400`. Charts reserve at least 20 pixels per cell, increasing to 24 pixels for three-digit column coordinates, plus 250 pixels for margins (minimum page width: 800). An undersized page reports the required width. Legend cards wrap into additional rows when needed. Long titles use a smaller font to fit the page while preserving letter proportions. Chart text is in English and uses the platform system font, including SF on macOS.

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

The editor is deployed to [GitHub Pages](https://seven332.github.io/my-beads/) after qualifying changes reach `main`. See [Deployment](#deployment) for setup and trigger rules.

Start the local editor from the repository root:

```bash
pnpm dev
```

Open the localhost URL printed by Vite. Use **Open CSV** to load a pattern, or **Start a new pattern** to create a blank grid. Imports are validated before replacing the document; invalid files leave your work intact. All file processing happens in your browser.

- **Pencil / Eraser:** click or drag. Fast drags interpolate cells; one drag is one undo step. Escape, loss of window focus, or an interrupted pointer gesture cancels the current stroke.
- **Fill:** recolor a four-connected region. **Pick:** select the color of an existing bead.
- **Palette:** search MARD codes or hex values, choose a color, and see per-color counts.
- **Navigate:** use +/− or pinch to zoom around the viewport/pointer; scroll, use Pan, or middle-drag to move the canvas. Fit centers the entire grid. Grid and Codes toggle overlays; codes appear when zoomed in enough to read.
- **Keyboard:** focus the canvas, move with arrow keys and draw with Enter or Space. Shift + arrows pans. Cmd/Ctrl + Z undoes; add Shift to redo.
- **Download:** select CSV, transparent pixel PNG, printable SVG, or printable PNG. Pixel scale is an integer from 1 to 512, including 1×; chart width defaults to 2400. The title is editable. Printable legends keep hex values and bead counts on separate lines and retain the MARD 221 footer.

The editor accepts grids up to 256 × 256, CSV files up to 2 MB and 100 undo steps. PNG exports are limited to 8192 pixels per side and 32 million pixels; SVG avoids the raster limit. Download a copy before replacing a document you want to keep.

### Import a Pixel Image

Use **Open image** for PNG or WebP. Set the intended **Target columns** and **Target rows**: a 1000 × 1000 image can become a 50 × 50 bead grid. The target defaults to the current grid dimensions. Each cell samples the source pixel at its center with nearest-neighbor sampling, without smoothing or background blending.

**Alpha threshold** defaults to 128 (0–255). Fully transparent pixels always remain empty; other pixels become beads when their alpha is at least the threshold. The preview shows the sampled source and its MARD version before the current document changes.

- **Preserve chroma** favors tinted palette colors for tinted source colors; it is enabled initially.
- **MARD series** restricts candidates, for example `B` or `B, H`; leave it empty for all colors.
- **Distinct assignments** gives each source color a different code; it is off initially. If there are too few candidates, the preview reports an error.
- In **Color mapping**, enter or choose a MARD code to override a source color; clear it for automatic matching. Invalid codes and conflicting distinct assignments must be corrected or cleared before Apply. Distinct mode reserves manual choices before assigning other colors.

Click **Update preview** after changing sampling or matching settings; this resets manual overrides. **Apply image** replaces the document and clears history, like opening CSV. Editor undo/redo shortcuts pause while this dialog is open; text fields retain their normal editing behavior. Cancel, Escape, invalid files, canceled reads and results made stale by newer work preserve the current document.

Imports are limited to 10 MB, 8192 pixels per side, 16 million decoded pixels and 256 sampled opaque colors. Color-rich images report an error; use pixel art or a smaller target grid. All image processing stays in the browser.

### Local Drafts

The editor automatically saves one versioned draft on this device and restores it after reload. The draft contains the title and grid, including empty cells. It saves completed edits, imports, new grids and undo/redo; unfinished strokes and image previews are excluded. Original images, undo history and viewport settings are not saved.

Corrupt or unsupported drafts remain stored, and automatic saving pauses until you choose **Replace saved draft**. If storage is unavailable or full, the editor keeps your active document, displays an error and provides **Retry saving draft**. Download your work when saving fails. Drafts belong to the current browser origin; different localhost ports have separate drafts, and multiple tabs share the same saved slot. Use downloads for permanent copies or multiple patterns.

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
pnpm test:production
pnpm build
```

`pnpm test` runs each package's test script. To test one package, use `pnpm --filter @my-beads/core test` or `pnpm --filter @my-beads/cli test`.

The core has a separate typecheck without Node or DOM globals. Its build emits a browser ESM bundle and type declarations under `packages/core/dist/`; the private workspace package exports TypeScript source for tsx and Vite. The web production build is in `apps/web/dist/`. TypeScript 6.0.3 is pinned within the supported range of the ESLint TypeScript parser.

CI runs lint, types, tests and production builds on Linux/macOS, plus Chromium/WebKit workflows on Linux. Tests cover CSV round trips, color matching, image sampling/alpha/overrides, grouped editing history, state isolation, stale import cancellation, real application bootstrap/teardown, draft corruption/storage failures and decoded export colors/alpha. Browser workflows import PNG/WebP through the real preview, apply mappings, edit/export, reload drafts and verify that unfinished strokes are not recovered. CLI pixel regression checks 1× and 20×; browser checks 1× and 3×. Printable exports are checked in both browsers using their system fonts: correct title/counts/legend contents, text inside the page and legend cards, separate legend lines, and complete non-overlapping coordinates. Prefer behavior, file-content and layout assertions over screenshot baselines. Screenshots under `codex-work/screenshots/` are for manual visual review.

The complete web editor is tracked in [#6](https://github.com/seven332/my-beads/issues/6). See [frontend architecture](docs/frontend-architecture.md) for state, lifecycle and testing conventions.

## Deployment

GitHub Actions builds and publishes `apps/web/dist` to **https://seven332.github.io/my-beads/**. In repository **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. The first publication runs after the deployment workflow is merged into `main`.

The **Deploy Pages** workflow runs on `main` pushes that change these inputs:

- Web source, public assets, HTML entry point, Vite/TypeScript configuration, environment files or package manifest.
- Shared core source (including the MARD palette), TypeScript configuration or package manifest.
- Root package/workspace/lock files, TypeScript configuration, `.npmrc`, or the deployment workflow itself.

Documentation, templates, CLI source and test-only changes do not independently deploy. Shared dependency files trigger conservatively; the workflow checks paths rather than comparing output bytes. Keep the path list in `.github/workflows/pages.yml` current when adding build inputs. For a deliberate redeployment, open **Actions → Deploy Pages → Run workflow** and select **main**. Both jobs reject other branches, including manual runs.

Before upload, the workflow runs lint, type checks, core/web tests and a production browser smoke test. Only the deploy job receives Pages/OIDC write permissions, and deployments are serialized. Existing PR checks remain enabled; PRs do not publish the site.

`pnpm test:production` builds the web app and tests it with Chromium/WebKit under `/my-beads/` using a separate Vite preview server on port 4174. It checks built JS/CSS paths, CSV import/edit/export and draft recovery. The production build uses relative asset URLs, so local development and repository subpaths both work. Install the Playwright browsers using the Development command before running it locally.

Only the static web artifact is uploaded. Imported files and saved drafts stay in the browser; local-development drafts do not automatically move to the GitHub Pages origin.

Commit messages follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).

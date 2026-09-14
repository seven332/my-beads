# My Beads

A browser-based editor for creating, editing, and exporting perler bead patterns.

My Beads uses the **MARD 221** palette and supports **English and Simplified Chinese**. Start with a blank canvas, a CSV pattern, or a pixel image, then turn it into a chart you can follow while placing beads.

**[Open the editor](https://seven332.github.io/my-beads/)**

## Create → Edit → Export

1. **Create a pattern.** Choose the size of a blank canvas, import a CSV with its original grid and colors, or convert a PNG/WebP image with adjustable sampling and color mapping.
2. **Edit on the canvas.** Draw with the pencil, erase, fill regions, and pick colors. Zoom and pan, undo and redo, and toggle grid lines or color codes. See how many beads each color uses and highlight their locations.
3. **Export your work.** Download CSV for later editing, a transparent pixel-art PNG at your chosen scale, or a printable PNG/SVG chart with coordinates, color codes, and a bead-count legend.

Search the palette by MARD code or hex color. When a hex color has no exact match, compare recommendations based on color difference and preserving chroma.

Files are processed locally in your browser. The editor keeps a local draft between visits; export a CSV to keep a separate copy or move your work to another device. Printable chart labels stay in English in either interface language.

Use **Appearance** beside the language selector to choose **System**, **Light**, or **Dark**. The default follows your system, including changes while the editor is open. Your choice is remembered on this device. Appearance changes the interface and canvas guides; bead colors and exported files retain their original colors.

## Keyboard Shortcuts

Open **Keyboard shortcuts** in the editor or press **?** for the full list in your interface language.

| Keys                                  | Action                                          |
| ------------------------------------- | ----------------------------------------------- |
| P / E / B / I / H                     | Pencil / Eraser / Fill / Eyedropper / Pan       |
| Hold Space + drag                     | Temporarily pan; release to return to your tool |
| + / −                                 | Zoom in / out                                   |
| Shift + 1 / Shift + 2                 | Fit the pattern / highlighted color             |
| G / C                                 | Toggle grid / color codes                       |
| Ctrl or ⌘ + Z / Ctrl or ⌘ + Shift + Z | Undo / redo                                     |
| Arrow keys / Shift + arrow keys       | Move the selected cell / pan                    |
| Enter                                 | Apply the selected tool to the selected cell    |

Focus the canvas for arrow keys and Enter. Space only pans. Shortcuts leave text inputs, input composition and dialogs to their normal keyboard behavior. Fitting a highlighted color requires a nonempty color highlight from the Used colors panel.

## Run Locally

Requires **Node.js 24+** and **pnpm 10.28.1**.

```bash
git clone https://github.com/seven332/my-beads.git
cd my-beads
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite.

## Command-Line Tools

The repository also includes tools for generating images and matching colors. After installing dependencies, run these from the repository root, replacing `pattern.csv` with your file:

```bash
# Generate a printable chart; use a .svg output path for SVG.
pnpm generate pattern.csv --output codex-work/chart.png --title "My Pattern"

# Generate pixel art. Use --scale 1 for one pixel per cell.
pnpm generate:pixel pattern.csv --output codex-work/pixel-art.png --scale 20

# Find a matching MARD color.
pnpm match:color "#4C4C40"
```

Add `--help` to any command for all options.

CSV files use a rectangular grid of MARD codes or exact palette hex values, with empty cells for transparency. Pattern files live in [`templates/`](templates/).

The built-in palette is based on the [Pixel Beads MARD color chart](https://www.pixel-beads.com/zh/mard-bead-color-chart). Its [color data](packages/core/src/data/mard-221-colors.json) is shared by the editor and CLI tools.

## Development

The project is a pnpm workspace written in TypeScript. The web editor uses **ccstate**, **lit-html**, **Canvas**, and **Tailwind CSS 4** with shared UI theme tokens.

| Directory                                          | Purpose                                                      |
| -------------------------------------------------- | ------------------------------------------------------------ |
| [`apps/web/`](apps/web/)                           | Browser editor                                               |
| [`apps/cli/`](apps/cli/)                           | Command-line tools                                           |
| [`packages/core/`](packages/core/)                 | Shared pattern, palette, color-matching, and rendering logic |
| [`packages/eslint-rules/`](packages/eslint-rules/) | Project lint rules                                           |

Format and validate from the repository root:

```bash
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:ci
pnpm build
```

Run browser tests with Chromium and WebKit:

```bash
pnpm --filter @my-beads/web exec playwright install chromium webkit
pnpm test:e2e
pnpm test:production
```

Tests live alongside their packages. See the [frontend architecture guide](docs/frontend-architecture.md) for state, rendering, translation, and testing conventions.

GitHub Actions checks pull requests and deploys the editor to GitHub Pages when changes affecting the web build reach `main`. See the [browser CI guide](docs/browser-ci.md) for filtering, sharding, and test reports, and the [deployment workflow](.github/workflows/pages.yml) for its triggers.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

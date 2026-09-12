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

Palette data is stored in [`src/data/mard-221-colors.json`](src/data/mard-221-colors.json). Both generators also accept a custom palette with `--palette`.

## Find the Closest Color

Find the MARD 221 color closest to a hex color:

```bash
npm run match:color -- "#4c4c40"
```

The command compares colors with CIEDE2000, which measures perceptual color difference. For a visibly tinted input, it searches tinted palette colors so that a dark green or brown is not flattened to a neutral gray. It accepts three-digit and six-digit hex colors, with or without `#`:

```text
Input: #4C4C40
Closest: B23 (#303921)
Delta E: 10.21 (CIEDE2000)
Mode: preserve chroma
```

Use `--include-neutral` to search every palette color using only CIEDE2000; for the example above, that mode returns H5. Use `--palette <path>` to search a custom palette.

Pass several colors with `--unique` to find the lowest-total-difference assignment without reusing a MARD color. Use `--series B` when the source colors should remain in MARD's green series:

```bash
npm run match:color -- 4D4D3D 35352A --unique --series B
```

## Setup

Install Node.js and the project dependencies:

```bash
npm install
```

## Printable Chart

Generate a print-friendly PNG or SVG:

```bash
npm run generate -- templates/<collection>/<pattern>.csv \
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

Use `--width` to set the output width in pixels. The default is `2400`. Chart text is in English and uses the platform system font, including SF on macOS.

Run the following command to see every option:

```bash
npm run generate -- --help
```

## Pixel Art

Generate a PNG directly from the CSV grid:

```bash
npm run generate:pixel -- templates/<collection>/<pattern>.csv \
  --output codex-work/pattern-pixel-art.png \
  --scale 20
```

Each CSV cell becomes a square block of pixels. Empty cells remain transparent, and the output contains no labels, guides, or legend. The default scale is `16`; for example, a 50 × 50 pattern at `--scale 20` produces a 1000 × 1000 PNG.

Run the following command to see every option:

```bash
npm run generate:pixel -- --help
```

## CSV Format

The input must be a rectangular CSV grid. Filled cells may contain either a MARD color code such as `H7` or a hex value found in the selected palette. Blank cells and the values `TRANSPARENT` and `ERASE` are treated as transparent.

When `--output` is omitted, the printable chart uses the suffix `-chart.png` and the pixel-art image uses `-pixel-art.png`.

## Development

Check the TypeScript source without generating files:

```bash
npm run typecheck
```

Commit messages follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).

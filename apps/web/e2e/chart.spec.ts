import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { defaultPalette, parsePatternCsv, serializePatternCsv } from "@my-beads/core";

async function checkChart(page: Page, csv: string, width: number, title: string) {
  const grid = parsePatternCsv(csv);
  const counts = new Map<string, number>();
  for (const row of grid) for (const code of row) if (code) counts.set(code, (counts.get(code) ?? 0) + 1);

  await page.goto("/");
  await page.getByLabel("Open CSV").setInputFiles({ name: `${title}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByLabel("Pattern title")).toHaveValue(title);
  await page.getByLabel("Export format").selectOption("svg");
  await page.getByLabel("Chart width").fill(String(width));
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const svg = await readFile((await (await pending).path())!, "utf8");

  // Inspect the actual download using its production fonts, without image baselines.
  await page.setContent(`<style>body { margin: 0 } svg { display: block }</style>${svg}`);
  await page.evaluate(() => document.fonts.ready);
  const chart = page.locator("svg");
  await expect(chart).toHaveAttribute("width", String(width));
  await expect(chart.getByText(title, { exact: true })).toHaveCount(1);
  await expect(chart.getByText("MARD 221", { exact: true })).toHaveCount(1);
  const beads = [...counts.values()].reduce((sum, count) => sum + count, 0);
  await expect(chart.getByText(`${grid[0].length} × ${grid.length} grid · ${counts.size} colors · ${beads} beads`, { exact: true })).toHaveCount(1);

  const layout = await chart.evaluate((svg, { columns, rows }) => {
    const page = (svg as SVGSVGElement).viewBox.baseVal;
    const inside = (inner: DOMRect, outer: DOMRect | SVGRect) => inner.x >= outer.x - .5 && inner.y >= outer.y - .5 &&
      inner.x + inner.width <= outer.x + outer.width + .5 && inner.y + inner.height <= outer.y + outer.height + .5;
    const text = [...svg.querySelectorAll("text")];
    const overflow = text.filter(label => !inside(label.getBBox(), page)).map(label => label.textContent);
    const cards = [...svg.querySelectorAll<SVGRectElement>('rect[rx="14"]')];
    const legends = cards.map(card => {
      const labels: SVGTextElement[] = [];
      for (let sibling = card.nextElementSibling; sibling && labels.length < 3; sibling = sibling.nextElementSibling) {
        if (sibling.tagName.toLowerCase() === "text") labels.push(sibling as SVGTextElement);
      }
      const bounds = card.getBBox();
      const boxes = labels.map(label => label.getBBox());
      return {
        text: labels.map(label => label.textContent),
        contained: inside(bounds, page) && boxes.every(box => inside(box, bounds)),
        separated: boxes.every((box, i) => i === 0 || box.y >= boxes[i - 1].y + boxes[i - 1].height),
      };
    });
    // Guide lines define the grid independently of its colors or cell contents.
    const lines = [...svg.querySelectorAll("line")];
    const left = Math.min(...lines.map(line => line.x1.baseVal.value));
    const right = Math.max(...lines.map(line => line.x2.baseVal.value));
    const top = Math.min(...lines.map(line => line.y1.baseVal.value));
    const bottom = Math.max(...lines.map(line => line.y2.baseVal.value));
    const cellWidth = (right - left) / columns, cellHeight = (bottom - top) / rows;
    const cells = text.filter(label => {
      const x = Number(label.getAttribute("x")), y = Number(label.getAttribute("y"));
      return x > left && x < right && y > top && y < bottom;
    }).map(label => {
      const rect = label.previousElementSibling;
      return {
        code: label.textContent, color: rect?.getAttribute("fill"),
        column: (Number(rect?.getAttribute("x")) - left) / cellWidth,
        row: (Number(rect?.getAttribute("y")) - top) / cellHeight,
        width: Number(rect?.getAttribute("width")) / cellWidth,
        height: Number(rect?.getAttribute("height")) / cellHeight,
        labelX: (Number(label.getAttribute("x")) - left) / cellWidth,
        labelY: (Number(label.getAttribute("y")) - top) / cellHeight,
      };
    });
    const coordinates = text.filter(label => /^\d+$/.test(label.textContent ?? "")).map(label => ({
      value: Number(label.textContent), x: Number(label.getAttribute("x")), y: Number(label.getAttribute("y")), box: label.getBBox(),
    }));
    const axes = [
      { labels: coordinates.filter(label => label.y < top), horizontal: true },
      { labels: coordinates.filter(label => label.y > bottom), horizontal: true },
      { labels: coordinates.filter(label => label.x < left), horizontal: false },
      { labels: coordinates.filter(label => label.x > right), horizontal: false },
    ].map(({ labels, horizontal }) => {
      labels.sort((a, b) => horizontal ? a.x - b.x : a.y - b.y);
      return {
        values: labels.map(label => label.value),
        separated: labels.every((label, i) => i === 0 || (horizontal
          ? label.box.x >= labels[i - 1].box.x + labels[i - 1].box.width
          : label.box.y >= labels[i - 1].box.y + labels[i - 1].box.height)),
      };
    });
    return { overflow, legends, axes, cells };
  }, { columns: grid[0].length, rows: grid.length });
  expect(layout.overflow).toEqual([]);
  expect(layout.cells).toEqual(grid.flatMap((row, y) => row.flatMap((code, x) => code ? [{
    code, color: defaultPalette.colors[code], column: x, row: y, width: 1, height: 1, labelX: x + .5, labelY: y + .5,
  }] : [])));
  expect(layout.legends.map(legend => legend.text).sort()).toEqual([...counts].map(([code, count]) =>
    [code, defaultPalette.colors[code], `${count} beads`]).sort());
  for (const legend of layout.legends) {
    expect(legend.contained, `Legend ${legend.text[0]} must fit its card`).toBe(true);
    expect(legend.separated, `Legend ${legend.text[0]} must use separate lines`).toBe(true);
  }
  for (const [index, axis] of layout.axes.entries()) {
    const length = index < 2 ? grid[0].length : grid.length;
    expect(axis.values).toEqual(Array.from({ length }, (_, i) => i + 1));
    expect(axis.separated, `Axis ${index} labels must not overlap`).toBe(true);
  }
}

test("narrow printable export keeps all legend entries inside their cards", async ({ page }) => {
  const colors = ["H7", "H5", "M12", "G17", "H4", "G14", "M9", "H20", "H2"];
  const grid = Array.from({ length: 4 }, (_, y) => Array.from({ length: 25 }, (_, x) => x % 4 === y ? colors[x % colors.length] : null));
  await checkChart(page, serializePatternCsv(grid), 800, "Nine-color study");
});

test("default Sherma printable export has complete readable labels and counts", async ({ page }) => {
  const csv = await readFile(new URL("../../../templates/hollow-knight/sherma-singing-50x50.csv", import.meta.url), "utf8");
  await checkChart(page, csv, 2400, "Sherma");
});

test("maximum-width grid exports separated three-digit coordinates", async ({ page }) => {
  await checkChart(page, Array(256).fill("H7").join(","), 6394, "Wide");
});

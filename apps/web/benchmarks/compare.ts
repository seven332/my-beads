import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { compareReports, type BenchmarkReport } from "./report.js";

async function reports(directory: string): Promise<BenchmarkReport[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return reports(path);
      if (entry.isFile() && entry.name === "metrics.json") {
        const value = JSON.parse(await readFile(path, "utf8")) as BenchmarkReport;
        if (value.schema !== 1) throw new Error(`Unsupported benchmark report: ${path}`);
        return [value];
      }
      return [];
    }),
  );
  return groups.flat();
}
const [baseline, candidate] = process.argv.slice(2);
if (!baseline || !candidate || process.argv.length !== 4)
  throw new Error("Usage: pnpm benchmark:3d:compare <baseline-directory> <candidate-directory>");
console.log(
  JSON.stringify(compareReports(await reports(baseline), await reports(candidate)), null, 2),
);

import { expect, it } from "vitest";
import { parsePatternCsv } from "@my-beads/core";
import { fixture, scenarios } from "../benchmarks/fixtures.js";
import {
  compareReports,
  distribution,
  summarize,
  type BenchmarkReport,
} from "../benchmarks/report.js";

it("generates the complete rectangular workload matrix with palette colors and empty cells", () => {
  expect(scenarios).toHaveLength(10);
  expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(10);
  for (const scenario of scenarios) {
    const grid = parsePatternCsv(fixture(scenario));
    expect(grid.length).toBe(scenario.height);
    expect(grid.every((row) => row.length === scenario.width)).toBe(true);
    const beads = grid.flat().filter((cell) => cell !== null).length;
    if (scenario.fill === "blank") expect(beads).toBe(0);
    else if (scenario.fill === "full") expect(beads).toBe(scenario.width * scenario.height);
    else {
      expect(beads).toBeGreaterThan(0);
      expect(beads).toBeLessThan(scenario.width * scenario.height);
    }
  }
});

it("keeps unavailable timing distinct from zero and uses nearest-rank percentiles", () => {
  expect(distribution([])).toEqual({ count: 0, min: null, p50: null, p95: null, max: null });
  expect(distribution([4, 0, 2, 8])).toEqual({ count: 4, min: 0, p50: 2, p95: 8, max: 8 });
  expect(() => distribution([NaN])).toThrow();
  expect(() => distribution([-1])).toThrow();
});

function report(): BenchmarkReport {
  const context = {
    id: 1,
    renderer: "test",
    vendor: "test",
    timerSupported: false,
    lost: true,
    buffer: { width: 100, height: 100 },
    resources: {},
    allocations: [],
  };
  const probe = {
    frames: [
      {
        context: 1,
        phase: "orbit",
        kind: "raf" as const,
        startedAt: 0,
        cpuMs: 2,
        inputToSubmitMs: 5,
        draws: 4,
        triangles: 2200,
        viewports: [],
        gpuMs: null,
        gpuStatus: "unsupported" as const,
      },
    ],
    contexts: [context],
    openings: [
      { readyMs: 10, context: 1 },
      { readyMs: 5, context: 2 },
      { readyMs: 6, context: 3 },
    ],
  };
  return {
    schema: 1,
    protocol: "test",
    scenario: "test",
    repeat: 0,
    revision: "base",
    dirty: false,
    environment: {
      browser: "chromium",
      browserVersion: "1",
      userAgent: "test",
      host: "test",
      deviceNote: "test",
      headless: true,
      emulation: "none",
      viewport: { width: 100, height: 100 },
      dpr: 1,
      renderer: "test",
      framebuffer: { width: 100, height: 100 },
      timerSupported: false,
    },
    probe,
    lifecycle: Array.from({ length: 3 }, () => ({
      opened: { ...context, lost: false },
      closed: context,
    })),
    summary: summarize(probe),
    checks: { idle: true, released: true, draft: true, csv: true },
  };
}

it("compares compatible revisions and preserves missing GPU evidence", () => {
  const baseline = report(),
    candidate = report();
  candidate.revision = "next";
  candidate.probe.openings[0].readyMs = 12;
  const [result] = compareReports([baseline], [candidate]);
  expect(result.repeatEvidence).toBe(false);
  expect(result.metrics[0]).toMatchObject({ delta: 2, aboveBaselineRange: true });
  expect(result.metrics.find((metric) => metric.metric === "orbit/gpuP95Ms")).toMatchObject({
    delta: null,
    aboveBaselineRange: null,
  });
});

it("rejects incompatible machines, missing scenarios, missing phases and failed invariants", () => {
  const baseline = report();
  const incompatible = report();
  incompatible.environment.renderer = "software";
  expect(() => compareReports([baseline], [incompatible])).toThrow(/Incompatible/);
  const different = report();
  different.scenario = "another";
  expect(() => compareReports([baseline], [different])).toThrow(/coverage/);
  const missing = report();
  missing.summary = {};
  expect(() => compareReports([baseline], [missing])).toThrow(/Incomplete/);
  const morePhases = report();
  morePhases.probe.frames.push({ ...morePhases.probe.frames[0], phase: "pan" });
  morePhases.summary = summarize(morePhases.probe);
  expect(() => compareReports([morePhases], [baseline])).toThrow(/Phase/);
  const failed = report();
  failed.checks.idle = false;
  expect(() => compareReports([baseline], [failed])).toThrow(/Incomplete/);
  expect(() => compareReports([], [])).toThrow();
});

it("rejects duplicate repeats, mixed revisions and unreleased contexts", () => {
  const baseline = report();
  expect(() => compareReports([baseline, report()], [report()])).toThrow(/Duplicate/);
  const mixed = report();
  mixed.repeat = 1;
  mixed.revision = "different";
  expect(() => compareReports([baseline, mixed], [report()])).toThrow(/Mixed/);
  const leaked = report();
  leaked.lifecycle[0].closed.lost = false;
  expect(() => compareReports([baseline], [leaked])).toThrow(/Incomplete/);
});

it("separates RAF CPU time from synchronous task tails and excludes missing GPU timing", () => {
  const probe = report().probe;
  probe.frames.push({ ...probe.frames[0], kind: "task", startedAt: 10, cpuMs: 20 });
  const summary = summarize(probe).orbit;
  expect(summary.cpuCallbackMs).toMatchObject({ count: 1, p95: 2 });
  expect(summary.cpuTaskTailMs).toMatchObject({ count: 1, p95: 20 });
  expect(summary.gpuCommandRangeMs).toMatchObject({ count: 0, p95: null });
  expect(summary.submittedFrameIntervalMs.p50).toBe(10);
});

import type { ProbeContext, ProbeSnapshot } from "./probe.js";

export function distribution(values: number[]) {
  if (values.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error("Measurements must be finite, nonnegative numbers");
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? null;
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1) ?? null,
  };
}

export function summarize(probe: ProbeSnapshot) {
  return Object.fromEntries(
    [...new Set(probe.frames.map((frame) => frame.phase))].map((phase) => {
      const frames = probe.frames.filter((frame) => frame.phase === phase && frame.draws > 0);
      return [
        phase,
        {
          cpuCallbackMs: distribution(
            frames.filter((frame) => frame.kind === "raf").map((frame) => frame.cpuMs),
          ),
          cpuTaskTailMs: distribution(
            frames.filter((frame) => frame.kind === "task").map((frame) => frame.cpuMs),
          ),
          inputToSubmitMs: distribution(
            frames.flatMap((frame) =>
              frame.inputToSubmitMs === null ? [] : [frame.inputToSubmitMs],
            ),
          ),
          gpuCommandRangeMs: distribution(
            frames.flatMap((frame) => (frame.gpuMs === null ? [] : [frame.gpuMs])),
          ),
          // These intervals include automation pacing. They are not free-running FPS.
          submittedFrameIntervalMs: distribution(
            frames.slice(1).map((frame, i) => frame.startedAt - frames[i].startedAt),
          ),
          draws: distribution(frames.map((frame) => frame.draws)),
          triangles: distribution(frames.map((frame) => frame.triangles)),
        },
      ];
    }),
  );
}

export interface BenchmarkReport {
  schema: 1;
  protocol: string;
  scenario: string;
  repeat: number;
  revision: string;
  dirty: boolean;
  environment: {
    browser: string;
    browserVersion: string;
    userAgent: string;
    host: string;
    deviceNote: string;
    headless: boolean;
    emulation: "none";
    viewport: { width: number; height: number };
    dpr: number;
    renderer: string;
    framebuffer: { width: number; height: number };
    timerSupported: boolean;
  };
  probe: ProbeSnapshot;
  lifecycle: { opened: ProbeContext; closed: ProbeContext }[];
  summary: ReturnType<typeof summarize>;
  checks: { idle: boolean; released: boolean; draft: boolean; csv: boolean };
}

export function compareReports(baseline: BenchmarkReport[], candidate: BenchmarkReport[]) {
  if (!baseline.length || !candidate.length) throw new Error("Both runs must contain reports");
  const key = (report: BenchmarkReport) => `${report.environment.browser}/${report.scenario}`;
  const keys = (reports: BenchmarkReport[]) => [...new Set(reports.map(key))].sort();
  if (JSON.stringify(keys(baseline)) !== JSON.stringify(keys(candidate)))
    throw new Error("Scenario/browser coverage differs");
  return keys(baseline).map((name) => {
    const before = baseline.filter((report) => key(report) === name);
    const after = candidate.filter((report) => key(report) === name);
    for (const group of [before, after]) {
      if (new Set(group.map((report) => report.repeat)).size !== group.length)
        throw new Error(`Duplicate repeats: ${name}`);
      if (new Set(group.map((report) => `${report.revision}/${report.dirty}`)).size !== 1)
        throw new Error(`Mixed revisions within a run: ${name}`);
    }
    const reference = before[0];
    for (const report of [...before, ...after]) {
      if (
        report.schema !== 1 ||
        report.protocol !== reference.protocol ||
        JSON.stringify(report.environment) !== JSON.stringify(reference.environment)
      )
        throw new Error(`Incompatible environment or protocol: ${name}`);
      if (
        !["idle", "released", "draft", "csv"].every(
          (check) => Reflect.get(report.checks, check) === true,
        ) ||
        report.probe.openings.length !== 3 ||
        report.lifecycle.length !== 3 ||
        report.lifecycle.some(
          ({ closed }) =>
            !closed.lost || Object.values(closed.resources).some((resource) => resource.live !== 0),
        ) ||
        !report.probe.frames.some((frame) => frame.draws > 0) ||
        !Object.keys(report.summary).length ||
        Object.values(report.summary).some((phase) => phase.draws.count === 0)
      )
        throw new Error(`Incomplete/failed measurements: ${name}`);
      if (
        JSON.stringify(Object.keys(report.summary).sort()) !==
        JSON.stringify(Object.keys(reference.summary).sort())
      )
        throw new Error(`Phase coverage differs: ${name}`);
    }
    const metrics = (
      reports: BenchmarkReport[],
      read: (report: BenchmarkReport) => number | null,
    ) =>
      distribution(
        reports.flatMap((report) => {
          const value = read(report);
          return value === null ? [] : [value];
        }),
      );
    const row = (metric: string, read: (report: BenchmarkReport) => number | null) => {
      const b = metrics(before, read),
        a = metrics(after, read);
      return {
        metric,
        baseline: b,
        candidate: a,
        delta: a.p50 === null || b.p50 === null ? null : a.p50 - b.p50,
        // Descriptive same-build repeat envelope; never a CI performance verdict.
        aboveBaselineRange: a.p50 === null || b.max === null ? null : a.p50 > b.max,
      };
    };
    return {
      name,
      repeatEvidence: before.length >= 3 && after.length >= 3,
      metrics: [
        row("firstSessionReadyMs", (report) => report.probe.openings[0].readyMs),
        row(
          "warmReadyP50Ms",
          (report) => distribution(report.probe.openings.slice(1).map((open) => open.readyMs)).p50,
        ),
        row(
          "warmReadyP95Ms",
          (report) => distribution(report.probe.openings.slice(1).map((open) => open.readyMs)).p95,
        ),
        ...[
          "Buffer",
          "Texture",
          "Framebuffer",
          "Renderbuffer",
          "Program",
          "Shader",
          "VertexArray",
        ].map((kind) =>
          row(`resources/${kind}/peak`, (report) =>
            Math.max(...report.probe.contexts.map((context) => context.resources[kind]?.peak ?? 0)),
          ),
        ),
        ...Object.keys(reference.summary).flatMap((phase) => [
          row(`${phase}/cpuP95Ms`, (report) => report.summary[phase].cpuCallbackMs.p95),
          row(`${phase}/cpuTaskTailP95Ms`, (report) => report.summary[phase].cpuTaskTailMs.p95),
          row(`${phase}/inputToSubmitP95Ms`, (report) => report.summary[phase].inputToSubmitMs.p95),
          row(
            `${phase}/pacedSubmissionIntervalP95Ms`,
            (report) => report.summary[phase].submittedFrameIntervalMs.p95,
          ),
          row(`${phase}/gpuP95Ms`, (report) => report.summary[phase].gpuCommandRangeMs.p95),
          row(`${phase}/trianglesMax`, (report) => report.summary[phase].triangles.max),
          row(`${phase}/drawsMax`, (report) => report.summary[phase].draws.max),
        ]),
      ],
    };
  });
}

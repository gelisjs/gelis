import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROUTES = 5_000;
const PER_KIND = 1_250;
const WARMUP = 20_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;
const CYCLES = 8;

type ZeroScenario =
  "static-raw" | "dynamic-raw" | "static-json" | "dynamic-json";

type Operation = () => number;

interface GelisLike {
  get(path: string, handler: (context: unknown) => unknown): unknown;
  fetch(request: Request): Response | PromiseLike<Response>;
}

interface GelisConstructor {
  new (): GelisLike;
}

interface WorkerResult {
  readonly mode: "zero-unused";
  readonly scenario: ZeroScenario;
  readonly probeOnly: boolean;
  readonly unit: "ns/op";
  readonly workerIndex: number;
  readonly pairedIterations: number;
  readonly warmups: number;
  readonly cycles: number;
  readonly workerRatio: number | null;
  readonly abbaRatios: readonly number[];
  readonly baabRatios: readonly number[];
  readonly cycleRatios: readonly number[];
  readonly controlMetrics: readonly number[];
  readonly candidateMetrics: readonly number[];
  readonly sink: number;
  readonly routes: number;
}

interface ParsedArgs {
  readonly scenario: string | undefined;
  readonly controlRoot: string | undefined;
  readonly candidateRoot: string | undefined;
  readonly workerIndex: string | undefined;
  readonly probeOnly: string | undefined;
  readonly launchGate: string | undefined;
  readonly resultFile: string | undefined;
}

interface PreparedScenario {
  readonly operation: Operation;
  readonly assertCorrectness: () => Promise<void>;
}

const args = readArgs(process.argv.slice(2));
const scenario = parseScenario(required(args.scenario, "--scenario"));
const controlRoot = required(args.controlRoot, "--control-root");
const candidateRoot = required(args.candidateRoot, "--candidate-root");
const workerIndex = parseWorkerIndex(
  required(args.workerIndex, "--worker-index"),
);
const probeOnly = args.probeOnly === "true";

if (args.launchGate !== undefined) {
  await waitForLaunchGate(args.launchGate);
}

const ControlGelis = await loadGelis(controlRoot, "control");
const CandidateGelis = await loadGelis(candidateRoot, "candidate");
const control = prepareScenario(ControlGelis, scenario);
const candidate = prepareScenario(CandidateGelis, scenario);

await control.assertCorrectness();
await candidate.assertCorrectness();

if (probeOnly) {
  emitResult(
    {
      mode: "zero-unused",
      scenario,
      probeOnly: true,
      unit: "ns/op",
      workerIndex,
      pairedIterations: 0,
      warmups: 0,
      cycles: 0,
      workerRatio: null,
      abbaRatios: [],
      baabRatios: [],
      cycleRatios: [],
      controlMetrics: [],
      candidateMetrics: [],
      sink: 0,
      routes: ROUTES,
    },
    args.resultFile,
  );
} else {
  let sink = 0;
  const invokeControl = () => {
    sink = ((sink << 5) - sink + control.operation()) | 0;
  };
  const invokeCandidate = () => {
    sink = ((sink << 5) - sink + candidate.operation()) | 0;
  };

  for (let index = 0; index < WARMUP; index++) {
    if ((index + workerIndex) % 2 === 0) {
      invokeControl();
      invokeCandidate();
    } else {
      invokeCandidate();
      invokeControl();
    }
  }

  let controlIterations: number;
  let candidateIterations: number;
  if (workerIndex % 2 === 0) {
    controlIterations = calibrate(invokeControl);
    candidateIterations = calibrate(invokeCandidate);
  } else {
    candidateIterations = calibrate(invokeCandidate);
    controlIterations = calibrate(invokeControl);
  }

  const pairedIterations = Math.max(
    1,
    Math.round(Math.sqrt(controlIterations * candidateIterations)),
  );
  const abbaRatios: number[] = [];
  const baabRatios: number[] = [];
  const cycleRatios: number[] = [];
  const controlMetrics: number[] = [];
  const candidateMetrics: number[] = [];

  for (let cycle = 0; cycle < CYCLES; cycle++) {
    const controlFirst = (workerIndex + cycle) % 2 === 0;
    let control1: number;
    let control2: number;
    let candidate1: number;
    let candidate2: number;

    if (controlFirst) {
      control1 = measureMetric(invokeControl, pairedIterations);
      candidate1 = measureMetric(invokeCandidate, pairedIterations);
      candidate2 = measureMetric(invokeCandidate, pairedIterations);
      control2 = measureMetric(invokeControl, pairedIterations);
    } else {
      candidate1 = measureMetric(invokeCandidate, pairedIterations);
      control1 = measureMetric(invokeControl, pairedIterations);
      control2 = measureMetric(invokeControl, pairedIterations);
      candidate2 = measureMetric(invokeCandidate, pairedIterations);
    }

    controlMetrics.push(control1, control2);
    candidateMetrics.push(candidate1, candidate2);
    const ratio = Math.sqrt((candidate1 * candidate2) / (control1 * control2));
    cycleRatios.push(ratio);
    (controlFirst ? abbaRatios : baabRatios).push(ratio);
  }

  emitResult(
    {
      mode: "zero-unused",
      scenario,
      probeOnly: false,
      unit: "ns/op",
      workerIndex,
      pairedIterations,
      warmups: WARMUP,
      cycles: CYCLES,
      workerRatio: median(cycleRatios),
      abbaRatios,
      baabRatios,
      cycleRatios,
      controlMetrics,
      candidateMetrics,
      sink,
      routes: ROUTES,
    },
    args.resultFile,
  );
}

async function loadGelis(
  root: string,
  tag: "control" | "candidate",
): Promise<GelisConstructor> {
  const appPath = join(root, "src/app.ts");
  const token = `${tag}-${process.pid}-${Date.now()}-${Math.random()}`;
  const module = (await import(
    `${pathToFileURL(appPath).href}?p11g9=${token}`
  )) as { Gelis?: GelisConstructor };

  if (module.Gelis === undefined) {
    throw new Error(`Gelis export missing from ${appPath}`);
  }

  return module.Gelis;
}

function prepareScenario(
  Gelis: GelisConstructor,
  scenario: ZeroScenario,
): PreparedScenario {
  const app = new Gelis();

  for (let index = 0; index < PER_KIND; index++) {
    app.get(`/sr/${index}`, () => new Response("ok"));
    app.get(`/dr/${index}/:id`, () => new Response("ok"));
    app.get(`/sj/${index}`, () => ({ ok: true }));
    app.get(`/dj/${index}/:id`, () => ({ ok: true }));
  }

  const last = PER_KIND - 1;
  const path =
    scenario === "static-raw"
      ? `/sr/${last}`
      : scenario === "dynamic-raw"
        ? `/dr/${last}/42`
        : scenario === "static-json"
          ? `/sj/${last}`
          : `/dj/${last}/42`;
  const request = new Request(`http://gelis.test${path}`);

  return {
    operation: () => {
      const response = app.fetch(request);
      assertSync(response, scenario);
      return (
        response.status + (response.headers.get("content-type")?.length ?? 0)
      );
    },
    assertCorrectness: async () => {
      const response = await app.fetch(request);
      if (response.status !== 200) {
        throw new Error(`${scenario} status mismatch: ${response.status}`);
      }

      const body = await response.text();
      const expected =
        scenario === "static-json" || scenario === "dynamic-json"
          ? JSON.stringify({ ok: true })
          : "ok";
      if (body !== expected) {
        throw new Error(`${scenario} body mismatch: ${body}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (scenario === "static-json" || scenario === "dynamic-json") {
        const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
        if (mediaType !== "application/json") {
          throw new Error(`${scenario} media type mismatch: ${mediaType}`);
        }
      } else if (
        contentType !== "text/plain;charset=UTF-8" &&
        contentType !== "text/plain; charset=utf-8"
      ) {
        throw new Error(`${scenario} content type mismatch: ${contentType}`);
      }
    },
  };
}

function calibrate(operation: () => void): number {
  let iterations = 1_000;

  while (true) {
    const elapsed = measure(operation, iterations);
    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
      );
    }
    iterations *= 2;
  }
}

function measureMetric(operation: () => void, iterations: number): number {
  return (measure(operation, iterations) * 1_000_000) / iterations;
}

function measure(operation: () => void, iterations: number): number {
  const start = performance.now();
  for (let index = 0; index < iterations; index++) operation();
  return performance.now() - start;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot summarize empty P11-G9 values");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function emitResult(result: WorkerResult, path: string | undefined): void {
  const json = JSON.stringify(result);
  if (path === undefined) {
    console.log(json);
    return;
  }
  writeFileSync(path, json, "utf8");
}

async function waitForLaunchGate(path: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if (readFileSync(path, "utf8") === "go") return;
    } catch {
      // Parent creates the gate after affinity and priority are applied.
    }
    await Bun.sleep(2);
  }
  throw new Error(`launch gate timeout: ${path}`);
}

function readArgs(values: readonly string[]): ParsedArgs {
  const entries = new Map<string, string>();

  for (const value of values) {
    if (!value.startsWith("--")) continue;
    const separator = value.indexOf("=");
    if (separator === -1) continue;
    entries.set(value.slice(2, separator), value.slice(separator + 1));
  }

  return {
    scenario: entries.get("scenario"),
    controlRoot: entries.get("control-root"),
    candidateRoot: entries.get("candidate-root"),
    workerIndex: entries.get("worker-index"),
    probeOnly: entries.get("probe-only"),
    launchGate: entries.get("launch-gate"),
    resultFile: entries.get("result-file"),
  };
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${flag}`);
  }
  return value;
}

function parseScenario(value: string): ZeroScenario {
  if (
    value !== "static-raw" &&
    value !== "dynamic-raw" &&
    value !== "static-json" &&
    value !== "dynamic-json"
  ) {
    throw new Error(`Unknown P11-G9 zero-unused scenario: ${value}`);
  }
  return value;
}

function parseWorkerIndex(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid --worker-index: ${value}`);
  }
  return parsed;
}

function assertSync<T>(
  value: T | PromiseLike<T>,
  label: string,
): asserts value is T {
  if (isPromiseLike(value)) {
    throw new Error(`Zero-unused ${label} unexpectedly became asynchronous`);
  }
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }
  return typeof (value as { then?: unknown }).then === "function";
}

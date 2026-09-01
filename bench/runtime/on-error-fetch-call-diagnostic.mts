import { cpus } from "node:os";
import { fileURLToPath } from "node:url";

import { Gelis } from "../../src/index.ts";

const SELF = fileURLToPath(import.meta.url);

const ROUTES = 5000;
const TARGET_INDEX = ROUTES - 1;

const SAMPLES = 11;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 30;
const WARMUP_ITERATIONS = 100_000;

const OK_RESPONSE = new Response("ok");
const HANDLED_RESPONSE = new Response("handled");

const HANDLE_ERROR = () => HANDLED_RESPONSE;

const REQUEST = new Request(`http://gelis.test/r/${TARGET_INDEX}`);

const scenarios = [
  "property-1",
  "property-2",
  "property-3",

  "captured-1",
  "captured-2",
  "captured-3",
] as const;

type Scenario = (typeof scenarios)[number];

interface BenchmarkRow {
  readonly scenario: Scenario;
  readonly nsPerOp: number;
  readonly opsPerSecond: number;
  readonly samples: readonly number[];
}

let sink: unknown;

const childScenario = readArgument("--child");

if (childScenario !== undefined) {
  if (!isScenario(childScenario)) {
    throw new Error(`Unknown fetch-call diagnostic scenario: ${childScenario}`);
  }

  const row = benchmarkScenario(childScenario);

  process.stdout.write(JSON.stringify(row));
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  const rows: BenchmarkRow[] = [];

  console.log("\nGelis onError fetch-call diagnostic benchmark");
  console.log(`Runtime:   bun ${Bun.version}`);
  console.log(`CPU:       ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`Routes:    ${ROUTES}`);
  console.log(`Samples:   ${SAMPLES}`);
  console.log("Isolation: fresh process per scenario\n");

  for (let index = 0; index < scenarios.length; index++) {
    const scenario = scenarios[index];

    if (scenario === undefined) {
      continue;
    }

    console.log(`[${index + 1}/${scenarios.length}] ${scenario}`);

    rows.push(await runChildScenario(scenario));
  }

  console.log("\nFetch-call diagnostic\n");

  console.table(
    rows.map((row) => ({
      scenario: row.scenario,
      "ns/op": round(row.nsPerOp, 2),
      "ops/s": Math.round(row.opsPerSecond).toLocaleString("en-US"),
    })),
  );

  console.log("\nProperty call\n");

  printGroup(rows, "property");

  console.log("\nCaptured fetch call\n");

  printGroup(rows, "captured");

  console.log("\nProperty vs captured\n");

  for (let hookCount = 1; hookCount <= 3; hookCount++) {
    const property = rows.find(
      (row) => row.scenario === `property-${hookCount}`,
    );

    const captured = rows.find(
      (row) => row.scenario === `captured-${hookCount}`,
    );

    if (!property || !captured) {
      continue;
    }

    console.log(
      [
        `${hookCount} hook(s):`,
        `property ${round(property.nsPerOp, 2)} ns`,
        `captured ${round(captured.nsPerOp, 2)} ns`,
        `delta ${round(property.nsPerOp - captured.nsPerOp, 2)} ns`,
      ].join(" | "),
    );
  }
}

async function runChildScenario(scenario: Scenario): Promise<BenchmarkRow> {
  const child = Bun.spawn([process.execPath, SELF, `--child=${scenario}`], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(child.stdout).text();

  const stderrPromise = new Response(child.stderr).text();

  const exitCode = await child.exited;

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      [`Diagnostic failed: ${scenario}`, stdout, stderr].join("\n"),
    );
  }

  const parsed: unknown = JSON.parse(stdout);

  if (!isBenchmarkRow(parsed)) {
    throw new Error(`Invalid diagnostic result: ${scenario}`);
  }

  return parsed;
}

function benchmarkScenario(scenario: Scenario): BenchmarkRow {
  const hookCount = readHookCount(scenario);

  const app = buildApp(hookCount);

  const operation = scenario.startsWith("captured")
    ? buildCapturedOperation(app)
    : buildPropertyOperation(app);

  const preflight = operation();

  if (preflight instanceof Promise) {
    throw new Error(`${scenario} unexpectedly became asynchronous`);
  }

  for (let index = 0; index < WARMUP_ITERATIONS; index++) {
    sink = operation();
  }

  const iterations = calibrate(operation);

  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const elapsed = measure(operation, iterations);

    samples.push((elapsed * 1_000_000) / iterations);
  }

  const nsPerOp = median(samples);

  return {
    scenario,
    nsPerOp,
    opsPerSecond: 1_000_000_000 / nsPerOp,
    samples,
  };
}

function buildApp(hookCount: number): Gelis {
  const app = new Gelis();

  for (let index = 0; index < hookCount; index++) {
    app.onError(HANDLE_ERROR);
  }

  for (let index = 0; index < ROUTES; index++) {
    app.get(`/r/${index}`, () => OK_RESPONSE);
  }

  return app;
}

function buildPropertyOperation(
  app: Gelis,
): () => Response | Promise<Response> {
  return () => app.fetch(REQUEST);
}

function buildCapturedOperation(
  app: Gelis,
): () => Response | Promise<Response> {
  /*
   * Capture the final compiled function once.
   *
   * If triple-hook slowdown disappears here,
   * property lookup / inline-cache behavior is
   * implicated rather than the compiled function.
   */
  const fetch = app.fetch;

  return () => fetch(REQUEST);
}

function readHookCount(scenario: Scenario): number {
  if (scenario.endsWith("-1")) {
    return 1;
  }

  if (scenario.endsWith("-2")) {
    return 2;
  }

  return 3;
}

function calibrate(operation: () => Response | Promise<Response>): number {
  let iterations = 1000;

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

function measure(
  operation: () => Response | Promise<Response>,
  iterations: number,
): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    sink = operation();
  }

  return performance.now() - start;
}

function printGroup(
  rows: readonly BenchmarkRow[],
  prefix: "property" | "captured",
): void {
  const group = rows.filter((row) => row.scenario.startsWith(`${prefix}-`));

  const baseline = group[0];

  if (baseline === undefined) {
    return;
  }

  console.table(
    group.map((row) => ({
      scenario: row.scenario,
      "ns/op": round(row.nsPerOp, 2),
      "delta ns": round(row.nsPerOp - baseline.nsPerOp, 2),
      "delta %": round((row.nsPerOp / baseline.nsPerOp - 1) * 100, 2),
    })),
  );
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  const middle = Math.floor(sorted.length / 2);

  const value = sorted[middle];

  if (value === undefined) {
    throw new Error("Cannot compute median of empty samples");
  }

  if (sorted.length % 2 === 1) {
    return value;
  }

  const left = sorted[middle - 1];

  if (left === undefined) {
    throw new Error("Cannot compute median of empty samples");
  }

  return (left + value) / 2;
}

function readArgument(name: string): string | undefined {
  const prefix = `${name}=`;

  const argument = process.argv.find((value) => value.startsWith(prefix));

  return argument?.slice(prefix.length);
}

function isScenario(value: string): value is Scenario {
  return (scenarios as readonly string[]).includes(value);
}

function isBenchmarkRow(value: unknown): value is BenchmarkRow {
  return (
    value !== null &&
    typeof value === "object" &&
    "scenario" in value &&
    typeof value.scenario === "string" &&
    isScenario(value.scenario) &&
    "nsPerOp" in value &&
    typeof value.nsPerOp === "number" &&
    "opsPerSecond" in value &&
    typeof value.opsPerSecond === "number" &&
    "samples" in value &&
    Array.isArray(value.samples) &&
    value.samples.every((sample) => typeof sample === "number")
  );
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

void sink;

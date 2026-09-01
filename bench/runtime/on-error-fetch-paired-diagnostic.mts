import { cpus } from "node:os";
import { fileURLToPath } from "node:url";

import { Gelis } from "../../src/index.ts";

const SELF = fileURLToPath(import.meta.url);

const ROUTES = 5000;
const TARGET_INDEX = ROUTES - 1;

const SAMPLES = 15;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 30;
const WARMUP_ITERATIONS = 100_000;

const OK_RESPONSE = new Response("ok");
const HANDLED_RESPONSE = new Response("handled");

const REQUEST = new Request(`http://gelis.test/r/${TARGET_INDEX}`);

const HANDLE_ERROR = () => HANDLED_RESPONSE;

type HookCount = 1 | 2 | 3;

interface ChildResult {
  readonly hookCount: HookCount;
  readonly propertyNs: number;
  readonly capturedNs: number;
  readonly deltaNs: number;
  readonly deltaPercent: number;
  readonly propertySamples: readonly number[];
  readonly capturedSamples: readonly number[];
}

let sink: unknown;

const childValue = readArgument("--child");

if (childValue !== undefined) {
  const hookCount = parseHookCount(childValue);

  const result = benchmarkHookCount(hookCount);

  process.stdout.write(JSON.stringify(result));
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  const results: ChildResult[] = [];

  console.log("\nGelis onError paired fetch-call diagnostic");
  console.log(`Runtime:   bun ${Bun.version}`);
  console.log(`CPU:       ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`Routes:    ${ROUTES}`);
  console.log(`Samples:   ${SAMPLES}`);
  console.log("Isolation: fresh process per hook count");
  console.log("Pairing:   property + captured use same app\n");

  for (let hookCount = 1; hookCount <= 3; hookCount++) {
    console.log(`[${hookCount}/3] ${hookCount} hook(s)`);

    results.push(await runChild(hookCount as HookCount));
  }

  console.log("\nPaired results\n");

  console.table(
    results.map((result) => ({
      hooks: result.hookCount,
      "property ns": round(result.propertyNs, 2),
      "captured ns": round(result.capturedNs, 2),
      "property penalty ns": round(result.deltaNs, 2),
      "property penalty %": round(result.deltaPercent, 2),
    })),
  );

  console.log("\nCompiled-function scaling\n");

  const capturedBaseline = results[0]?.capturedNs;

  if (capturedBaseline !== undefined) {
    console.table(
      results.map((result) => ({
        hooks: result.hookCount,
        "captured ns": round(result.capturedNs, 2),
        "delta vs 1 hook": round(result.capturedNs - capturedBaseline, 2),
        "delta %": round((result.capturedNs / capturedBaseline - 1) * 100, 2),
      })),
    );
  }
}

async function runChild(hookCount: HookCount): Promise<ChildResult> {
  const child = Bun.spawn([process.execPath, SELF, `--child=${hookCount}`], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(child.stdout).text();

  const stderrPromise = new Response(child.stderr).text();

  const exitCode = await child.exited;

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      [`Paired diagnostic failed: ${hookCount}`, stdout, stderr].join("\n"),
    );
  }

  const value: unknown = JSON.parse(stdout);

  if (!isChildResult(value)) {
    throw new Error(`Invalid paired result: ${hookCount}`);
  }

  return value;
}

function benchmarkHookCount(hookCount: HookCount): ChildResult {
  const app = buildApp(hookCount);

  const propertyOperation = () => app.fetch(REQUEST);

  const fetch = app.fetch;

  const capturedOperation = () => fetch(REQUEST);

  const propertyPreflight = propertyOperation();

  const capturedPreflight = capturedOperation();

  if (
    propertyPreflight instanceof Promise ||
    capturedPreflight instanceof Promise
  ) {
    throw new Error("Diagnostic unexpectedly became asynchronous");
  }

  /*
   * Warm both call sites equally.
   */
  for (let index = 0; index < WARMUP_ITERATIONS; index++) {
    sink = index % 2 === 0 ? propertyOperation() : capturedOperation();
  }

  const propertyIterations = calibrate(propertyOperation);

  const capturedIterations = calibrate(capturedOperation);

  const propertySamples: number[] = [];
  const capturedSamples: number[] = [];

  /*
   * Alternate measurement order so one call
   * form does not consistently benefit from
   * running first.
   */
  for (let sample = 0; sample < SAMPLES; sample++) {
    if (sample % 2 === 0) {
      propertySamples.push(
        sampleOperation(propertyOperation, propertyIterations),
      );

      capturedSamples.push(
        sampleOperation(capturedOperation, capturedIterations),
      );
    } else {
      capturedSamples.push(
        sampleOperation(capturedOperation, capturedIterations),
      );

      propertySamples.push(
        sampleOperation(propertyOperation, propertyIterations),
      );
    }
  }

  const propertyNs = median(propertySamples);

  const capturedNs = median(capturedSamples);

  const deltaNs = propertyNs - capturedNs;

  return {
    hookCount,
    propertyNs,
    capturedNs,
    deltaNs,
    deltaPercent: (deltaNs / capturedNs) * 100,
    propertySamples,
    capturedSamples,
  };
}

function buildApp(hookCount: HookCount): Gelis {
  const app = new Gelis();

  for (let index = 0; index < hookCount; index++) {
    app.onError(HANDLE_ERROR);
  }

  for (let index = 0; index < ROUTES; index++) {
    app.get(`/r/${index}`, () => OK_RESPONSE);
  }

  return app;
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

function sampleOperation(
  operation: () => Response | Promise<Response>,
  iterations: number,
): number {
  const elapsed = measure(operation, iterations);

  return (elapsed * 1_000_000) / iterations;
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

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  const middle = Math.floor(sorted.length / 2);

  const value = sorted[middle];

  if (value === undefined) {
    throw new Error("Cannot compute median");
  }

  return value;
}

function parseHookCount(value: string): HookCount {
  const parsed = Number(value);

  if (parsed !== 1 && parsed !== 2 && parsed !== 3) {
    throw new Error(`Invalid hook count: ${value}`);
  }

  return parsed;
}

function readArgument(name: string): string | undefined {
  const prefix = `${name}=`;

  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

function isChildResult(value: unknown): value is ChildResult {
  if (value === null || typeof value !== "object") {
    return false;
  }

  if (
    !("hookCount" in value) ||
    !("propertyNs" in value) ||
    !("capturedNs" in value) ||
    !("deltaNs" in value) ||
    !("deltaPercent" in value) ||
    !("propertySamples" in value) ||
    !("capturedSamples" in value)
  ) {
    return false;
  }

  return (
    (value.hookCount === 1 || value.hookCount === 2 || value.hookCount === 3) &&
    typeof value.propertyNs === "number" &&
    typeof value.capturedNs === "number" &&
    typeof value.deltaNs === "number" &&
    typeof value.deltaPercent === "number" &&
    Array.isArray(value.propertySamples) &&
    Array.isArray(value.capturedSamples)
  );
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

void sink;

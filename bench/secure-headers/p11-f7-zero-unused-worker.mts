import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const WARMUP_SYNC = 20_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;

type ZeroScenario =
  "static-raw" | "dynamic-raw" | "static-json" | "dynamic-json";

interface WorkerResult {
  readonly mode: "zero-unused";
  readonly framework: "gelis";
  readonly scenario: ZeroScenario;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
  readonly routes: number;
}

const args = readArgs(process.argv.slice(2));

console.log(JSON.stringify(await runZeroUnused(args)));

async function runZeroUnused(args: ParsedArgs): Promise<WorkerResult> {
  const root = required(args.root, "--root");
  const scenario = required(args.scenario, "--scenario") as ZeroScenario;
  assertZeroScenario(scenario);

  const moduleUrl = pathToFileURL(resolve(root, "src/index.ts")).href;
  const module = (await import(moduleUrl)) as {
    Gelis: new () => {
      get(path: string, handler: (context: unknown) => unknown): unknown;
      fetch(request: Request): Response | Promise<Response>;
    };
  };

  const app = new module.Gelis();
  const perKind = 1_250;

  for (let index = 0; index < perKind; index++) {
    app.get(`/sr/${index}`, () => new Response("ok"));
    app.get(`/dr/${index}/:id`, () => new Response("ok"));
    app.get(`/sj/${index}`, () => ({ ok: true }));
    app.get(`/dj/${index}/:id`, () => ({ ok: true }));
  }

  const last = perKind - 1;
  const path =
    scenario === "static-raw"
      ? `/sr/${last}`
      : scenario === "dynamic-raw"
        ? `/dr/${last}/42`
        : scenario === "static-json"
          ? `/sj/${last}`
          : `/dj/${last}/42`;

  const request = new Request(`http://gelis.test${path}`);
  let sink = 0;

  const operation = () => {
    const response = app.fetch(request);

    if (isPromiseLike(response)) {
      throw new Error(
        `Zero-unused ${scenario} unexpectedly became asynchronous`,
      );
    }

    if (!(response instanceof Response) || response.status !== 200) {
      throw new Error(`Zero-unused ${scenario} correctness validation failed`);
    }

    sink ^= response.status;
  };

  for (let index = 0; index < WARMUP_SYNC; index++) {
    operation();
  }

  const iterations = calibrateSync(operation);
  const elapsed = measureSync(operation, iterations);

  return {
    mode: "zero-unused",
    framework: "gelis",
    scenario,
    iterations,
    warmups: WARMUP_SYNC,
    nsPerOp: (elapsed * 1_000_000) / iterations,
    sink,
    routes: perKind * 4,
  };
}

interface ParsedArgs {
  readonly root?: string | undefined;
  readonly scenario?: string | undefined;
}

function readArgs(values: readonly string[]): ParsedArgs {
  const entries = new Map<string, string>();

  for (const value of values) {
    if (!value.startsWith("--")) {
      continue;
    }

    const separator = value.indexOf("=");
    if (separator === -1) {
      continue;
    }

    entries.set(value.slice(2, separator), value.slice(separator + 1));
  }

  return {
    root: entries.get("root"),
    scenario: entries.get("scenario"),
  };
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function assertZeroScenario(value: string): asserts value is ZeroScenario {
  if (
    value !== "static-raw" &&
    value !== "dynamic-raw" &&
    value !== "static-json" &&
    value !== "dynamic-json"
  ) {
    throw new Error(`Unknown zero-unused scenario: ${value}`);
  }
}

function calibrateSync(operation: () => void): number {
  let iterations = 1_000;

  while (true) {
    const elapsed = measureSync(operation, iterations);

    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
      );
    }

    iterations *= 2;
  }
}

function measureSync(operation: () => void, iterations: number): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
  }

  return performance.now() - start;
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

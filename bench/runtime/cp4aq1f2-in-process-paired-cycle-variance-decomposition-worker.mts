import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROUTES = 5_000;
const LAST = ROUTES - 1;
const PARAM_VALUE = "value-42";
const WARMUP = 20_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;
const CYCLES = 8;

type Cell =
  | "static-only-raw"
  | "generic-dynamic-raw"
  | "trailing-dynamic-json"
  | "collision-dynamic-raw"
  | "all-dynamic-raw";

type Operation = () => number;

type HandlerContext = {
  readonly params: Record<string, string>;
};

interface GelisLike {
  get(path: string, handler: (context: HandlerContext) => unknown): unknown;
  all(path: string, handler: (context: HandlerContext) => unknown): unknown;
  fetch(request: Request): Response | PromiseLike<Response>;
}

interface GelisConstructor {
  new (): GelisLike;
}

interface LoadedSource {
  readonly Gelis: GelisConstructor;
}

interface PreparedCell {
  readonly operation: Operation;
  readonly assertCorrectness: () => Promise<void>;
}

interface WorkerResult {
  readonly cell: Cell;
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
  readonly aMetrics: readonly number[];
  readonly bMetrics: readonly number[];
  readonly sink: number;
}

interface ParsedArgs {
  readonly cell: string | undefined;
  readonly sourceRootA: string | undefined;
  readonly sourceRootB: string | undefined;
  readonly workerIndex: string | undefined;
  readonly probeOnly: string | undefined;
  readonly launchGate: string | undefined;
  readonly resultFile: string | undefined;
}

const FROZEN_CELLS = new Set<Cell>([
  "static-only-raw",
  "generic-dynamic-raw",
  "trailing-dynamic-json",
  "collision-dynamic-raw",
  "all-dynamic-raw",
]);

const args = readArgs(process.argv.slice(2));
const requestedCell = required(args.cell, "--cell");
if (!FROZEN_CELLS.has(requestedCell as Cell)) {
  throw new Error(`Unknown CP4-AQ1F2 cell: ${requestedCell}`);
}
const cell = requestedCell as Cell;
const sourceRootA = required(args.sourceRootA, "--source-root-a");
const sourceRootB = required(args.sourceRootB, "--source-root-b");
const workerIndex = parseWorkerIndex(
  required(args.workerIndex, "--worker-index"),
);
const probeOnly = args.probeOnly === "true";
const resultFile = args.resultFile;

if (args.launchGate !== undefined) {
  await waitForLaunchGate(args.launchGate);
}

const sourceA = await loadSource(sourceRootA, "a");
const sourceB = await loadSource(sourceRootB, "b");
const preparedA = prepareCell(sourceA.Gelis, cell);
const preparedB = prepareCell(sourceB.Gelis, cell);

await preparedA.assertCorrectness();
await preparedB.assertCorrectness();

if (probeOnly) {
  emitResult(
    {
      cell,
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
      aMetrics: [],
      bMetrics: [],
      sink: 0,
    },
    resultFile,
  );
} else {
  let sink = 0;
  const invokeA = () => {
    const value = preparedA.operation();
    sink = ((sink << 5) - sink + value) | 0;
  };
  const invokeB = () => {
    const value = preparedB.operation();
    sink = ((sink << 5) - sink + value) | 0;
  };

  for (let index = 0; index < WARMUP; index++) {
    if ((index + workerIndex) % 2 === 0) {
      invokeA();
      invokeB();
    } else {
      invokeB();
      invokeA();
    }
  }

  let iterationsA: number;
  let iterationsB: number;
  if (workerIndex % 2 === 0) {
    iterationsA = calibrate(invokeA);
    iterationsB = calibrate(invokeB);
  } else {
    iterationsB = calibrate(invokeB);
    iterationsA = calibrate(invokeA);
  }

  const pairedIterations = Math.max(
    1,
    Math.round(Math.sqrt(iterationsA * iterationsB)),
  );
  const cycleRatios: number[] = [];
  const abbaRatios: number[] = [];
  const baabRatios: number[] = [];
  const aMetrics: number[] = [];
  const bMetrics: number[] = [];

  for (let cycle = 0; cycle < CYCLES; cycle++) {
    const abba = (workerIndex + cycle) % 2 === 0;
    let a1: number;
    let a2: number;
    let b1: number;
    let b2: number;

    if (abba) {
      a1 = measureMetric(invokeA, pairedIterations);
      b1 = measureMetric(invokeB, pairedIterations);
      b2 = measureMetric(invokeB, pairedIterations);
      a2 = measureMetric(invokeA, pairedIterations);
    } else {
      b1 = measureMetric(invokeB, pairedIterations);
      a1 = measureMetric(invokeA, pairedIterations);
      a2 = measureMetric(invokeA, pairedIterations);
      b2 = measureMetric(invokeB, pairedIterations);
    }

    aMetrics.push(a1, a2);
    bMetrics.push(b1, b2);
    const ratio = Math.sqrt((b1 * b2) / (a1 * a2));
    cycleRatios.push(ratio);
    (abba ? abbaRatios : baabRatios).push(ratio);
  }

  emitResult(
    {
      cell,
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
      aMetrics,
      bMetrics,
      sink,
    },
    resultFile,
  );
}

async function loadSource(
  sourceRoot: string,
  tag: "a" | "b",
): Promise<LoadedSource> {
  const appPath = join(sourceRoot, "src/app.ts");
  const token = `${tag}-${process.pid}-${Date.now()}-${Math.random()}`;
  const module = (await import(
    `${pathToFileURL(appPath).href}?cp4aq1f2=${token}`
  )) as { Gelis?: GelisConstructor };
  if (module.Gelis === undefined) {
    throw new Error(`Gelis export missing from ${appPath}`);
  }
  return { Gelis: module.Gelis };
}

function prepareCell(Gelis: GelisConstructor, cell: Cell): PreparedCell {
  switch (cell) {
    case "static-only-raw":
      return staticOnlyCell(Gelis);
    case "generic-dynamic-raw":
      return genericCell(Gelis);
    case "trailing-dynamic-json":
      return trailingJsonCell(Gelis);
    case "collision-dynamic-raw":
      return collisionCell(Gelis);
    case "all-dynamic-raw":
      return allCell(Gelis);
  }
}

function staticOnlyCell(Gelis: GelisConstructor): PreparedCell {
  const app = new Gelis();
  for (let index = 0; index < ROUTES; index++) {
    app.get(`/s/${index}`, () => "static");
  }
  const request = new Request(`http://gelis.test/s/${LAST}?source=cp4f2`);
  return responseCell(app, request, "static", false);
}

function genericCell(Gelis: GelisConstructor): PreparedCell {
  const app = new Gelis();
  for (let index = 0; index < ROUTES; index++) {
    app.get(`/g/${index}/:left/x/:right`, ({ params }) => params.right);
  }
  const request = new Request(
    `http://gelis.test/g/${LAST}/left/x/right?source=cp4f2`,
  );
  return responseCell(app, request, "right", false);
}

function trailingJsonCell(Gelis: GelisConstructor): PreparedCell {
  const app = new Gelis();
  for (let index = 0; index < ROUTES; index++) {
    app.get(`/r/${index}/:id`, ({ params }) => ({ id: params.id }));
  }
  const request = new Request(
    `http://gelis.test/r/${LAST}/${PARAM_VALUE}?source=cp4f2`,
  );
  return responseCell(
    app,
    request,
    JSON.stringify({ id: PARAM_VALUE }),
    true,
  );
}

function collisionCell(Gelis: GelisConstructor): PreparedCell {
  const app = new Gelis();
  for (let index = 0; index < ROUTES; index++) {
    app.get(collisionRoutePath(index), ({ params }) => params.id);
  }
  const request = new Request(
    `http://gelis.test${collisionRequestPath(LAST)}?source=cp4f2`,
  );
  return responseCell(app, request, PARAM_VALUE, false);
}

function allCell(Gelis: GelisConstructor): PreparedCell {
  const app = new Gelis();
  for (let index = 0; index < ROUTES; index++) {
    app.all(`/a/${index}/:id`, ({ params }) => params.id);
  }
  const request = new Request(
    `http://gelis.test/a/${LAST}/${PARAM_VALUE}?source=cp4f2`,
    { method: "PATCH" },
  );
  return responseCell(app, request, PARAM_VALUE, false);
}

function responseCell(
  app: GelisLike,
  request: Request,
  expectedBody: string,
  expectJson: boolean,
): PreparedCell {
  return {
    operation: () => {
      const response = app.fetch(request);
      assertSync(response, "response");
      return consumeResponse(response);
    },
    assertCorrectness: async () => {
      const response = await app.fetch(request);
      if (response.status !== 200) {
        throw new Error(`response status mismatch: ${response.status}`);
      }
      const body = await response.text();
      if (body !== expectedBody) {
        throw new Error(`response body mismatch: ${body}`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (expectJson) {
        const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
        if (mediaType !== "application/json") {
          throw new Error(`JSON media type mismatch: ${mediaType}`);
        }
      } else if (contentType !== "text/plain; charset=utf-8") {
        throw new Error(`text Content-Type mismatch: ${contentType}`);
      }
    },
  };
}

function consumeResponse(response: Response): number {
  return response.status + (response.headers.get("content-type")?.length ?? 0);
}

function collisionRoutePath(index: number): string {
  return `/collision/${index.toString().padStart(4, "0")}aaaa/:id`;
}

function collisionRequestPath(index: number): string {
  return `/collision/${index.toString().padStart(4, "0")}aaaa/${PARAM_VALUE}`;
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
  if (values.length === 0) throw new Error("Cannot take median of empty values");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
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
    cell: entries.get("cell"),
    sourceRootA: entries.get("source-root-a"),
    sourceRootB: entries.get("source-root-b"),
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
  if (isPromiseLike(value)) throw new Error(`unexpected async ${label}`);
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

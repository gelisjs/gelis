import { createInterface } from "node:readline";

import { resolve } from "node:path";

import { pathToFileURL } from "node:url";

const ROUTES = 5_000;
const TARGET_INDEX = ROUTES - 1;
const WARMUP_ITERATIONS = 50_000;
const MEASURED_ITERATIONS = 100_000;

interface AppLike {
  get(path: string, handler: () => unknown): unknown;

  fetch(request: Request): Response | Promise<Response>;
}

interface GelisConstructor {
  new (): AppLike;
}

type Workload = "shared-response" | "string-normalized";

const args = process.argv.slice(2);

const root = readArgument(args, "--root=");

const workload = readWorkload(args);

const module = (await import(
  pathToFileURL(resolve(root, "src/index.ts")).href
)) as {
  readonly Gelis: GelisConstructor;
};

const app = createApplication(module.Gelis, workload);

const request = new Request(`http://gelis.test/r/${TARGET_INDEX}`);

let sink = 0;

verifyCorrectness(app);

warmup(app);

writeMessage({
  type: "ready",
  workload,
});

const input = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

for await (const line of input) {
  if (line === "measure") {
    Bun.gc(true);

    const ns = measure(app);

    writeMessage({
      type: "measurement",
      ns,
    });

    continue;
  }

  if (line === "close") {
    input.close();

    break;
  }

  throw new Error(`Unknown worker command: ${line}`);
}

void sink;

function createApplication(
  Constructor: GelisConstructor,
  selectedWorkload: Workload,
): AppLike {
  const application = new Constructor();

  if (selectedWorkload === "shared-response") {
    const response = new Response("ok");

    for (let index = 0; index < ROUTES; index++) {
      application.get(`/r/${index}`, () => response);
    }

    return application;
  }

  for (let index = 0; index < ROUTES; index++) {
    application.get(`/r/${index}`, () => "ok");
  }

  return application;
}

function verifyCorrectness(application: AppLike): void {
  const result = application.fetch(request);

  if (!(result instanceof Response)) {
    throw new Error("Worker application unexpectedly became asynchronous");
  }

  if (result.status !== 200) {
    throw new Error(`Unexpected worker response status: ${result.status}`);
  }
}

function warmup(application: AppLike): void {
  for (let index = 0; index < WARMUP_ITERATIONS; index++) {
    consume(application.fetch(request));
  }
}

function measure(application: AppLike): number {
  const start = performance.now();

  for (let index = 0; index < MEASURED_ITERATIONS; index++) {
    consume(application.fetch(request));
  }

  return ((performance.now() - start) * 1_000_000) / MEASURED_ITERATIONS;
}

function consume(result: Response | Promise<Response>): void {
  if (!(result instanceof Response)) {
    throw new Error("Expected synchronous worker response");
  }

  sink += result.status;
}

function readArgument(values: readonly string[], prefix: string): string {
  const argument = values.find((value) => value.startsWith(prefix));

  const value = argument?.slice(prefix.length);

  if (!value) {
    throw new Error(`Expected ${prefix}<value>`);
  }

  return resolve(value);
}

function readWorkload(values: readonly string[]): Workload {
  const argument = values.find((value) => value.startsWith("--workload="));

  const value = argument?.slice("--workload=".length);

  if (value === "shared-response" || value === "string-normalized") {
    return value;
  }

  throw new Error("Expected --workload=shared-response|string-normalized");
}

function writeMessage(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

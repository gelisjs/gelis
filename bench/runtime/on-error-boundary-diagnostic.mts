import { cpus } from "node:os";
import { fileURLToPath } from "node:url";

type RuntimeFetch = (request: Request) => Response | Promise<Response>;

type RuntimeErrorHandler = (
  request: Request,
  error: unknown,
) => Response | Promise<Response>;

const SELF = fileURLToPath(import.meta.url);

const SAMPLES = 11;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 30;
const WARMUP_ITERATIONS = 100_000;

const REQUEST = new Request("http://gelis.test/r/4999");

const OK_RESPONSE = new Response("ok");

const METHOD_NOT_ALLOWED_RESPONSE = new Response("method not allowed", {
  status: 405,
});

const INNER_FETCH: RuntimeFetch = (request) => {
  if (request.method === "GET") {
    return OK_RESPONSE;
  }

  return METHOD_NOT_ALLOWED_RESPONSE;
};

const scenarios = [
  "direct-many-1",
  "direct-many-2",
  "direct-many-3",

  "object-many-1",
  "object-many-2",
  "object-many-3",

  "rewrite-1",
  "rewrite-2",
  "rewrite-3",
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
    throw new Error(`Unknown diagnostic scenario: ${childScenario}`);
  }

  const row = benchmarkScenario(childScenario);

  process.stdout.write(JSON.stringify(row));
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  const rows: BenchmarkRow[] = [];

  console.log("\nGelis onError boundary diagnostic benchmark");

  console.log(`Runtime:   bun ${Bun.version}`);
  console.log(`CPU:       ${cpus()[0]?.model ?? "unknown"}`);
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

  console.log("\nBoundary diagnostic\n");

  console.table(
    rows.map((row) => ({
      scenario: row.scenario,
      "ns/op": round(row.nsPerOp, 2),
      "ops/s": Math.round(row.opsPerSecond).toLocaleString("en-US"),
    })),
  );

  console.log("\nRelative groups\n");

  printGroup(rows, "direct-many");
  printGroup(rows, "object-many");
  printGroup(rows, "rewrite");
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
  const operation = buildOperation(scenario);

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

function buildOperation(
  scenario: Scenario,
): () => Response | Promise<Response> {
  switch (scenario) {
    case "direct-many-1":
      return buildDirectOperation(1);

    case "direct-many-2":
      return buildDirectOperation(2);

    case "direct-many-3":
      return buildDirectOperation(3);

    case "object-many-1":
      return buildObjectOperation(1);

    case "object-many-2":
      return buildObjectOperation(2);

    case "object-many-3":
      return buildObjectOperation(3);

    case "rewrite-1":
      return buildRewriteOperation(1);

    case "rewrite-2":
      return buildRewriteOperation(2);

    case "rewrite-3":
      return buildRewriteOperation(3);
  }
}

function buildDirectOperation(
  hookCount: number,
): () => Response | Promise<Response> {
  const fetch = compileErrorBoundary(
    INNER_FETCH,
    compileColdErrorHandler(hookCount),
  );

  return () => fetch(REQUEST);
}

function buildObjectOperation(
  hookCount: number,
): () => Response | Promise<Response> {
  const holder: {
    fetch: RuntimeFetch;
  } = {
    fetch: INNER_FETCH,
  };

  holder.fetch = compileErrorBoundary(
    INNER_FETCH,
    compileColdErrorHandler(hookCount),
  );

  return () => holder.fetch(REQUEST);
}

function buildRewriteOperation(
  writeCount: number,
): () => Response | Promise<Response> {
  const holder: {
    fetch: RuntimeFetch;
  } = {
    fetch: INNER_FETCH,
  };

  /*
   * Keep the final function shape identical for
   * every rewrite scenario.
   *
   * Only the number of previous writes changes.
   */
  for (let index = 1; index < writeCount; index++) {
    holder.fetch = compileErrorBoundary(
      INNER_FETCH,
      compileColdErrorHandler(2),
    );
  }

  const finalFetch = compileErrorBoundary(
    INNER_FETCH,
    compileColdErrorHandler(2),
  );

  holder.fetch = finalFetch;

  return () => holder.fetch(REQUEST);
}

function compileColdErrorHandler(hookCount: number): RuntimeErrorHandler {
  /*
   * Deliberately capture state whose size differs
   * between 1, 2, and 3-hook plans.
   *
   * The handler is never invoked by the successful
   * benchmark path.
   */
  const hooks = Array.from(
    {
      length: hookCount,
    },
    (_, index) => index,
  );

  return (request, error) => {
    if (hooks.length === 0 || request.method !== "GET") {
      throw error;
    }

    return OK_RESPONSE;
  };
}

function compileErrorBoundary(
  innerFetch: RuntimeFetch,
  handleError: RuntimeErrorHandler,
): RuntimeFetch {
  return (request) => {
    let result: Response | Promise<Response>;

    try {
      result = innerFetch(request);
    } catch (error) {
      return handleError(request, error);
    }

    if (result instanceof Promise) {
      return result.catch((error) => handleError(request, error));
    }

    return result;
  };
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

function printGroup(rows: readonly BenchmarkRow[], prefix: string): void {
  const group = rows.filter((row) => row.scenario.startsWith(`${prefix}-`));

  if (group.length === 0) {
    return;
  }

  const baseline = group[0];

  if (baseline === undefined) {
    return;
  }

  console.log(`\n${prefix}`);

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

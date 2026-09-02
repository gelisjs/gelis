import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Gelis } from "../../src/index.ts";
import { parseQueryFromUrl } from "../../src/runtime/input.ts";
import { querySyncSchema } from "../http/validation/schemas.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-attribution.mts");

const ROUTES = 5000;
const TARGET_INDEX = ROUTES - 1;

const SAMPLES = 11;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;
const WARMUP_ITERATIONS = 50_000;

const URL = `http://gelis.test/r/${TARGET_INDEX}?page=42&q=gelis`;
const PLAIN_URL = `http://gelis.test/r/${TARGET_INDEX}`;

const RAW_QUERY: Record<string, string> = {
  page: "42",
  q: "gelis",
};

const OK_RESPONSE = new Response("ok");

const scenarios = [
  "plain-fetch",
  "query-fetch",
  "parse-query",
  "validate-nested",
  "validate-captured",
  "parse-validate-nested",
  "parse-validate-captured",
] as const;

type Scenario = (typeof scenarios)[number];

interface ResultRow {
  readonly scenario: Scenario;
  readonly nsPerOp: number;
  readonly opsPerSecond: number;
  readonly samples: readonly number[];
}

let sink: unknown;

const requestedScenario = readScenario();

if (requestedScenario !== undefined) {
  runChild(requestedScenario);
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  const rows: ResultRow[] = [];

  console.log("\nGelis validation component attribution");
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

    rows.push(await runIsolated(scenario));
  }

  console.log("\nComponent results\n");

  console.table(
    rows.map((row) => ({
      scenario: row.scenario,
      "ns/op": round(row.nsPerOp, 2),
      "ops/s": Math.round(row.opsPerSecond).toLocaleString("en-US"),
    })),
  );

  const byScenario = new Map(rows.map((row) => [row.scenario, row.nsPerOp]));

  const plainFetch = requireResult(byScenario, "plain-fetch");
  const queryFetch = requireResult(byScenario, "query-fetch");

  const parseQuery = requireResult(byScenario, "parse-query");

  const validateNested = requireResult(byScenario, "validate-nested");

  const validateCaptured = requireResult(byScenario, "validate-captured");

  const parseValidateNested = requireResult(
    byScenario,
    "parse-validate-nested",
  );

  const parseValidateCaptured = requireResult(
    byScenario,
    "parse-validate-captured",
  );

  console.log("\nAttribution\n");

  console.table([
    {
      comparison: "query fetch overhead vs plain",
      "delta ns": round(queryFetch - plainFetch, 2),
      "delta %": round((queryFetch / plainFetch - 1) * 100, 2),
    },
    {
      comparison: "captured validate vs nested",
      "delta ns": round(validateCaptured - validateNested, 2),
      "delta %": round((validateCaptured / validateNested - 1) * 100, 2),
    },
    {
      comparison: "captured parse+validate vs nested",
      "delta ns": round(parseValidateCaptured - parseValidateNested, 2),
      "delta %": round(
        (parseValidateCaptured / parseValidateNested - 1) * 100,
        2,
      ),
    },
    {
      comparison: "parse only",
      "delta ns": round(parseQuery, 2),
      "delta %": 0,
    },
    {
      comparison: "nested validate only",
      "delta ns": round(validateNested, 2),
      "delta %": 0,
    },
    {
      comparison: "captured validate only",
      "delta ns": round(validateCaptured, 2),
      "delta %": 0,
    },
    {
      comparison: "nested parse+validate",
      "delta ns": round(parseValidateNested, 2),
      "delta %": 0,
    },
    {
      comparison: "captured parse+validate",
      "delta ns": round(parseValidateCaptured, 2),
      "delta %": 0,
    },
  ]);

  console.log("\nApproximate integration remainder\n");

  console.table([
    {
      model: "query overhead - nested parse+validate",
      "remainder ns": round(queryFetch - plainFetch - parseValidateNested, 2),
    },
    {
      model: "query overhead - captured parse+validate",
      "remainder ns": round(queryFetch - plainFetch - parseValidateCaptured, 2),
    },
  ]);

  void sink;
}

async function runIsolated(scenario: Scenario): Promise<ResultRow> {
  const child = Bun.spawn([process.execPath, CHILD, `--scenario=${scenario}`], {
    cwd: resolve(HERE, "../.."),
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();

  const exitCode = await child.exited;

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      [`Validation attribution failed: ${scenario}`, stdout, stderr].join("\n"),
    );
  }

  const line = stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith("RESULT "));

  if (!line) {
    throw new Error(`Missing result for ${scenario}\n${stdout}`);
  }

  const parsed: unknown = JSON.parse(line.slice("RESULT ".length));

  if (!isResultRow(parsed)) {
    throw new Error(`Invalid result for ${scenario}`);
  }

  return parsed;
}

function runChild(scenario: Scenario): void {
  const operation = createOperation(scenario);

  for (let index = 0; index < WARMUP_ITERATIONS; index++) {
    operation();
  }

  const iterations = calibrate(operation);
  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const elapsed = measure(operation, iterations);

    samples.push((elapsed * 1_000_000) / iterations);
  }

  const nsPerOp = median(samples);

  const row: ResultRow = {
    scenario,
    nsPerOp,
    opsPerSecond: 1_000_000_000 / nsPerOp,
    samples,
  };

  console.log(`RESULT ${JSON.stringify(row)}`);

  void sink;
}

function createOperation(scenario: Scenario): () => void {
  switch (scenario) {
    case "plain-fetch": {
      const app = buildPlainApp();
      const request = new Request(PLAIN_URL);

      return () => {
        const result = app.fetch(request);

        if (isPromiseLike(result)) {
          throw new Error("plain-fetch unexpectedly became async");
        }

        sink = result;
      };
    }

    case "query-fetch": {
      const app = buildQueryApp();
      const request = new Request(URL);

      return () => {
        const result = app.fetch(request);

        if (isPromiseLike(result)) {
          throw new Error("query-fetch unexpectedly became async");
        }

        sink = result;
      };
    }

    case "parse-query":
      return () => {
        sink = parseQueryFromUrl(URL);
      };

    case "validate-nested":
      return () => {
        sink = querySyncSchema["~standard"].validate(RAW_QUERY);
      };

    case "validate-captured": {
      const validate = querySyncSchema["~standard"].validate;

      return () => {
        sink = validate(RAW_QUERY);
      };
    }

    case "parse-validate-nested":
      return () => {
        const query = parseQueryFromUrl(URL);

        sink = querySyncSchema["~standard"].validate(query);
      };

    case "parse-validate-captured": {
      const validate = querySyncSchema["~standard"].validate;

      return () => {
        const query = parseQueryFromUrl(URL);

        sink = validate(query);
      };
    }
  }
}

function buildPlainApp(): Gelis {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    app.get(`/r/${index}`, () => OK_RESPONSE);
  }

  return app;
}

function buildQueryApp(): Gelis {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    app.get(
      `/r/${index}`,
      {
        query: querySyncSchema,
      },
      () => OK_RESPONSE,
    );
  }

  return app;
}

function calibrate(operation: () => void): number {
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

function measure(operation: () => void, iterations: number): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
  }

  return performance.now() - start;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    const value = sorted[middle];

    if (value === undefined) {
      throw new Error("Cannot compute median of empty samples");
    }

    return value;
  }

  const left = sorted[middle - 1];
  const right = sorted[middle];

  if (left === undefined || right === undefined) {
    throw new Error("Cannot compute median of empty samples");
  }

  return (left + right) / 2;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  return (
    typeof (
      value as {
        then?: unknown;
      }
    ).then === "function"
  );
}

function readScenario(): Scenario | undefined {
  const prefix = "--scenario=";

  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (!argument) {
    return undefined;
  }

  const value = argument.slice(prefix.length);

  if (!scenarios.includes(value as Scenario)) {
    throw new Error(`Unknown validation attribution scenario: ${value}`);
  }

  return value as Scenario;
}

function requireResult(
  values: ReadonlyMap<Scenario, number>,
  scenario: Scenario,
): number {
  const value = values.get(scenario);

  if (value === undefined) {
    throw new Error(`Missing result: ${scenario}`);
  }

  return value;
}

function isResultRow(value: unknown): value is ResultRow {
  return (
    value !== null &&
    typeof value === "object" &&
    "scenario" in value &&
    typeof value.scenario === "string" &&
    scenarios.includes(value.scenario as Scenario) &&
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

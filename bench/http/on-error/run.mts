import { mkdirSync, writeFileSync } from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../../..");

const RESULTS_DIR = resolve(HERE, "../results");

const GENERATED_DIR = resolve(HERE, "../generated");

const PORT = 3100;

const ROUTES = 5000;

const QUICK = process.argv.includes("--quick");

const CONNECTIONS = QUICK ? 20 : 50;

const SAMPLES = QUICK ? 1 : 7;

const WARMUP_SECONDS = QUICK ? 1 : 2;

const DURATION_SECONDS = QUICK ? 2 : 10;

interface OnErrorHttpFramework {
  readonly name: string;
  readonly server: string;
  readonly env: Record<string, string>;
}

interface ExpectedResponse {
  readonly status: number;
  readonly body: string;
}

const frameworks = [
  {
    name: "gelis",

    server: resolve(HERE, "servers/gelis.ts"),

    env: {},
  },

  {
    name: "hono",

    server: resolve(HERE, "servers/hono.ts"),

    env: {},
  },

  {
    name: "elysia",

    server: resolve(HERE, "servers/elysia.ts"),

    env: {
      PRECOMPILE: "false",
    },
  },

  {
    name: "elysia-precompile",

    server: resolve(HERE, "servers/elysia.ts"),

    env: {
      PRECOMPILE: "true",
    },
  },
] as const satisfies readonly OnErrorHttpFramework[];

const benchmarkCases = [
  {
    name: "plain",
    query: false,
  },

  {
    name: "on-error-unused",
    query: false,
  },

  {
    name: "handler-error-sync",
    query: false,
  },

  {
    name: "handler-error-async",
    query: false,
  },

  {
    name: "async-on-error",
    query: false,
  },

  {
    name: "request-phase-error",
    query: false,
  },
] as const;

type OnErrorHttpCase = (typeof benchmarkCases)[number];

type OnErrorHttpCaseName = OnErrorHttpCase["name"];

const expectedResponses: Record<OnErrorHttpCaseName, ExpectedResponse> = {
  plain: {
    status: 200,
    body: "ok",
  },

  "on-error-unused": {
    status: 200,
    body: "ok",
  },

  "handler-error-sync": {
    status: 200,
    body: "handled",
  },

  "handler-error-async": {
    status: 200,
    body: "handled",
  },

  "async-on-error": {
    status: 200,
    body: "handled",
  },

  "request-phase-error": {
    status: 200,
    body: "handled",
  },
};

const requestedCases = readListArgument("--cases");

const selectedCases =
  requestedCases.length === 0
    ? benchmarkCases
    : requestedCases.map((name) => {
        const found = benchmarkCases.find(
          (candidate) => candidate.name === name,
        );

        if (!found) {
          throw new Error(`Unknown onError HTTP benchmark case: ${name}`);
        }

        return found;
      });

const selectedCaseNames = selectedCases.map(({ name }) => name);

mkdirSync(
  RESULTS_DIR,

  {
    recursive: true,
  },
);

mkdirSync(
  GENERATED_DIR,

  {
    recursive: true,
  },
);

const filtered = requestedCases.length > 0;

const resultFile = QUICK
  ? filtered
    ? `latest-on-error-quick-${selectedCaseNames.join("-")}.json`
    : "latest-on-error-quick.json"
  : filtered
    ? `latest-on-error-${selectedCaseNames.join("-")}.json`
    : "latest-on-error.json";

console.log(`Selected cases: ${selectedCaseNames.join(", ")}`);

console.log(
  QUICK
    ? "Benchmark mode: quick"
    : filtered
      ? "Benchmark mode: filtered"
      : "Benchmark mode: full",
);

console.log("");

const allRows: HttpNestedAggregateRow[] = [];

for (let caseIndex = 0; caseIndex < selectedCases.length; caseIndex++) {
  const benchmarkCase = selectedCases[caseIndex];

  if (!benchmarkCase) {
    continue;
  }

  const urlFile = createUrlFile(benchmarkCase);

  const rows = new Map<string, OhaSample[]>();

  for (const framework of frameworks) {
    rows.set(framework.name, []);
  }

  for (let sample = 0; sample < SAMPLES; sample++) {
    const rotated = rotate(
      frameworks,

      (sample + caseIndex) % frameworks.length,
    );

    for (const framework of rotated) {
      const server = startServer(framework, benchmarkCase);

      try {
        await waitUntilReady(benchmarkCase);

        await semanticPreflight(framework, benchmarkCase);

        await prewarmRoutes(benchmarkCase);

        await runOha(urlFile, Math.min(CONNECTIONS, 10), WARMUP_SECONDS);

        const result = await runOha(urlFile, CONNECTIONS, DURATION_SECONDS);

        if (result.successRate !== 1) {
          throw new Error(
            `${framework.name} | ${benchmarkCase.name}: success rate ${result.successRate}`,
          );
        }

        const frameworkRows = rows.get(framework.name);

        if (!frameworkRows) {
          throw new Error(`Missing result bucket for ${framework.name}`);
        }

        frameworkRows.push(result);

        console.log(
          `${framework.name} | ${benchmarkCase.name} | sample ${sample + 1}/${SAMPLES} | ${Math.round(
            result.requestsPerSecond,
          ).toLocaleString("en-US")} req/s`,
        );
      } finally {
        server.kill();

        await server.exited;
      }
    }
  }

  for (const framework of frameworks) {
    const samples = rows.get(framework.name);

    if (!samples) {
      throw new Error(`Missing samples for ${framework.name}`);
    }

    allRows.push(aggregate(framework.name, benchmarkCase.name, samples));
  }
}

console.log("\nGelis onError HTTP benchmark");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`oha:         ${await getOhaVersion()}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Routes:      ${ROUTES}`);

console.log(`Connections: ${CONNECTIONS}`);

console.log(`Samples:     ${SAMPLES}`);

console.log(`Warmup:      ${WARMUP_SECONDS}s`);

console.log(`Duration:    ${DURATION_SECONDS}s`);

console.log(`Cases:       ${selectedCaseNames.join(", ")}`);

console.log("");

console.table(
  allRows.map((row) => ({
    framework: row.framework,

    case: row.case,

    "req/s median": Math.round(row.requestsPerSecond.median).toLocaleString(
      "en-US",
    ),

    "req/s min": Math.round(row.requestsPerSecond.min).toLocaleString("en-US"),

    "req/s max": Math.round(row.requestsPerSecond.max).toLocaleString("en-US"),

    "cv %": round(row.requestsPerSecond.cv * 100, 2),

    "p50 ms": round(row.latency.p50, 3),

    "p95 ms": round(row.latency.p95, 3),

    "p99 ms": round(row.latency.p99, 3),

    success: `${round(row.successRate * 100, 2)}%`,
  })),
);

const comparisons = createComparisons(allRows);
const successPathFeatureDeltas = createSuccessPathFeatureDeltas(allRows);

console.log("\nGelis throughput comparison\n");

console.table(
  comparisons.map((row) => ({
    case: row.case,

    competitor: row.competitor,

    "Gelis req/s": Math.round(row.gelis).toLocaleString("en-US"),

    "competitor req/s": Math.round(row.competitorValue).toLocaleString("en-US"),

    "Gelis advantage %": round(row.advantage, 2),
  })),
);

if (successPathFeatureDeltas.length > 0) {
  console.log(
    "\nObserved local-workload success-path delta: on-error-unused vs plain\n",
  );

  console.table(
    successPathFeatureDeltas.map((row) => ({
      framework: row.framework,

      "plain req/s": Math.round(row.plainRequestsPerSecond).toLocaleString(
        "en-US",
      ),

      "on-error-unused req/s": Math.round(
        row.featureRequestsPerSecond,
      ).toLocaleString("en-US"),

      "delta %": round(row.deltaPercent, 2),
    })),
  );
}

const output = {
  metadata: {
    generatedAt: new Date().toISOString(),

    runtime: `bun ${Bun.version}`,

    oha: await getOhaVersion(),

    cpu: cpus()[0]?.model ?? "unknown",

    routes: ROUTES,

    connections: CONNECTIONS,

    samples: SAMPLES,

    warmupSeconds: WARMUP_SECONDS,

    durationSeconds: DURATION_SECONDS,

    quick: QUICK,

    cases: selectedCaseNames,
  },

  results: allRows,

  comparisons,

  successPathFeatureDeltas,
};

writeFileSync(
  resolve(RESULTS_DIR, resultFile),

  `${JSON.stringify(output, null, 2)}\n`,
);

console.log(`\nRaw results: bench/http/results/${resultFile}`);

function createUrlFile(benchmarkCase: OnErrorHttpCase): string {
  const file = resolve(
    GENERATED_DIR,

    `on-error-${benchmarkCase.name}.txt`,
  );

  const query = "";

  const urls: string[] = [];

  for (let index = 0; index < ROUTES; index++) {
    urls.push(`http://127.0.0.1:${PORT}/r/${index}${query}`);
  }

  writeFileSync(
    file,

    `${urls.join("\n")}\n`,
  );

  return file;
}

function startServer(
  framework: OnErrorHttpFramework,
  benchmarkCase: OnErrorHttpCase,
) {
  return Bun.spawn(
    [process.execPath, framework.server],

    {
      cwd: ROOT,

      env: {
        ...process.env,

        ...framework.env,

        PORT: String(PORT),

        ROUTES: String(ROUTES),

        CASE: benchmarkCase.name,
      },

      stdout: "pipe",

      stderr: "pipe",
    },
  );
}

async function waitUntilReady(benchmarkCase: OnErrorHttpCase): Promise<void> {
  const url = `http://127.0.0.1:${PORT}/r/0`;

  const deadline = Date.now() + 20_000;

  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      /*
       * Any HTTP response proves that the
       * server is reachable.
       *
       * Scenario correctness is validated
       * separately by semanticPreflight().
       */
      await response.arrayBuffer();

      return;
    } catch (error) {
      lastError = error;
    }

    await Bun.sleep(25);
  }

  throw new Error(`Server did not become reachable for ${benchmarkCase.name}`, {
    cause: lastError,
  });
}

async function semanticPreflight(
  framework: OnErrorHttpFramework,
  benchmarkCase: OnErrorHttpCase,
): Promise<void> {
  const expected = expectedResponses[benchmarkCase.name];

  if (!expected) {
    throw new Error(`Missing expected response for ${benchmarkCase.name}`);
  }

  const url = `http://127.0.0.1:${PORT}/r/0`;

  const response = await fetch(url);

  const body = await response.text();

  if (response.status !== expected.status || body !== expected.body) {
    throw new Error(
      [
        `${framework.name} | ${benchmarkCase.name}: semantic preflight failed`,
        `expected: HTTP ${expected.status} body ${JSON.stringify(expected.body)}`,
        `received: HTTP ${response.status} body ${JSON.stringify(body)}`,
      ].join("\n"),
    );
  }
}

async function prewarmRoutes(benchmarkCase: OnErrorHttpCase): Promise<void> {
  const expected = expectedResponses[benchmarkCase.name];

  if (!expected) {
    throw new Error(`Missing expected response for ${benchmarkCase.name}`);
  }

  const BATCH = 100;

  for (let start = 0; start < ROUTES; start += BATCH) {
    const requests: Promise<Response>[] = [];

    for (let index = start; index < Math.min(start + BATCH, ROUTES); index++) {
      requests.push(fetch(`http://127.0.0.1:${PORT}/r/${index}`));
    }

    const responses = await Promise.all(requests);

    for (const response of responses) {
      if (response.status !== expected.status) {
        throw new Error(
          [
            `Prewarm failed for ${benchmarkCase.name}`,
            `expected HTTP ${expected.status}`,
            `received HTTP ${response.status}`,
          ].join(": "),
        );
      }

      await response.arrayBuffer();
    }
  }
}

async function runOha(
  urlFile: string,
  connections: number,
  seconds: number,
): Promise<OhaSample> {
  const process = Bun.spawn(
    [
      "oha",

      "-z",
      `${seconds}s`,

      "-c",
      String(connections),

      "--no-tui",

      "--output-format",
      "json",

      "--urls-from-file",
      urlFile,
    ],

    {
      cwd: ROOT,

      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdoutPromise = new Response(process.stdout).text();

  const stderrPromise = new Response(process.stderr).text();

  const exitCode = await process.exited;

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(`oha failed:\n${stderr}`);
  }

  const json: unknown = JSON.parse(stdout);

  return parseOha(json);
}

function parseOha(value: unknown): OhaSample {
  const json = toOhaJson(value);

  const requestsPerSecond =
    json.metrics?.requests_per_sec ?? json.summary?.requestsPerSec;

  if (typeof requestsPerSecond !== "number") {
    throw new Error("Unable to read requests/sec from oha output");
  }

  const successRate = json.metrics?.success_rate ?? json.summary?.successRate;

  if (typeof successRate !== "number") {
    throw new Error("Unable to read success rate from oha output");
  }

  return {
    requestsPerSecond,

    successRate,

    latency: {
      p50: getLatencyPercentile(json, "p50"),

      p95: getLatencyPercentile(json, "p95"),

      p99: getLatencyPercentile(json, "p99"),
    },
  };
}

function getLatencyPercentile(
  json: OhaJson,
  percentile: "p50" | "p95" | "p99",
): number {
  /*
   * Newer oha output exposes CI-friendly
   * latency metrics directly in milliseconds.
   */
  const metric = json.metrics?.latency_ms?.[percentile];

  if (typeof metric === "number") {
    return metric;
  }

  /*
   * Legacy/current standard JSON field is
   * top-level and expressed in seconds.
   */
  const legacy = json.latencyPercentiles?.[percentile];

  if (typeof legacy === "number") {
    return legacy * 1000;
  }

  throw new Error(`Unable to read ${percentile} latency from oha output`);
}

function aggregate(
  framework: string,
  caseName: string,
  samples: OhaSample[],
): HttpNestedAggregateRow {
  const throughput = samples.map((sample) => sample.requestsPerSecond);

  return {
    framework,

    case: caseName,

    requestsPerSecond: {
      median: median(throughput),

      min: Math.min(...throughput),

      max: Math.max(...throughput),

      cv: coefficientOfVariation(throughput),
    },

    latency: {
      p50: median(samples.map((sample) => sample.latency.p50)),

      p95: median(samples.map((sample) => sample.latency.p95)),

      p99: median(samples.map((sample) => sample.latency.p99)),
    },

    successRate: Math.min(...samples.map((sample) => sample.successRate)),

    samples,
  };
}

function createComparisons(
  rows: HttpNestedAggregateRow[],
): HttpThroughputComparisonRow[] {
  const comparisons: HttpThroughputComparisonRow[] = [];

  for (const caseName of selectedCaseNames) {
    const gelis = rows.find(
      (row) => row.case === caseName && row.framework === "gelis",
    );

    if (!gelis) {
      continue;
    }

    for (const competitor of ["hono", "elysia", "elysia-precompile"]) {
      const other = rows.find(
        (row) => row.case === caseName && row.framework === competitor,
      );

      if (!other) {
        continue;
      }

      comparisons.push({
        case: caseName,

        competitor,

        gelis: gelis.requestsPerSecond.median,

        competitorValue: other.requestsPerSecond.median,

        advantage:
          (gelis.requestsPerSecond.median / other.requestsPerSecond.median -
            1) *
          100,
      });
    }
  }

  return comparisons;
}

function createSuccessPathFeatureDeltas(
  rows: HttpNestedAggregateRow[],
): HttpFeatureDeltaRow[] {
  const deltas: HttpFeatureDeltaRow[] = [];

  for (const framework of frameworks) {
    const plain = rows.find(
      (row) => row.framework === framework.name && row.case === "plain",
    );

    const feature = rows.find(
      (row) =>
        row.framework === framework.name && row.case === "on-error-unused",
    );

    if (!plain || !feature) {
      continue;
    }

    deltas.push({
      framework: framework.name,
      baselineCase: "plain",
      featureCase: "on-error-unused",
      plainRequestsPerSecond: plain.requestsPerSecond.median,
      featureRequestsPerSecond: feature.requestsPerSecond.median,
      deltaPercent:
        (feature.requestsPerSecond.median / plain.requestsPerSecond.median -
          1) *
        100,
    });
  }

  return deltas;
}

function rotate<T>(values: readonly T[], offset: number): T[] {
  return [...values.slice(offset), ...values.slice(0, offset)];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    const value = sorted[middle];

    if (value === undefined) {
      throw new Error("Cannot compute median of an empty sample set");
    }

    return value;
  }

  const left = sorted[middle - 1];
  const right = sorted[middle];

  if (left === undefined || right === undefined) {
    throw new Error("Cannot compute median of an empty sample set");
  }

  return (left + right) / 2;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance) / mean;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function readListArgument(name: string): string[] {
  const prefix = `${name}=`;

  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (!argument) {
    return [];
  }

  return argument
    .slice(prefix.length)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function getOhaVersion(): Promise<string> {
  const process = Bun.spawn(
    ["oha", "--version"],

    {
      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdout = await new Response(process.stdout).text();

  await process.exited;

  return stdout.trim();
}

function toOhaJson(value: unknown): OhaJson {
  if (value === null || typeof value !== "object") {
    throw new Error("oha output must be a JSON object");
  }

  return value as OhaJson;
}

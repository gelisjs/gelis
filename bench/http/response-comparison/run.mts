import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../../..");

const RESULTS_DIR = resolve(HERE, "../results");

const GENERATED_DIR = resolve(HERE, "../generated");

const PORT = 3100;

const ROUTES = 5000;

const CONNECTIONS = 50;

const SAMPLES = 7;

const WARMUP_CONNECTIONS = 10;

const WARMUP_DURATION = "2s";

const DURATION = "10s";

const PREWARM_BATCH_SIZE = 100;

interface Framework {
  readonly name: "gelis" | "hono" | "elysia" | "elysia-precompile";

  readonly file: string;

  readonly env?: Readonly<Record<string, string>>;
}

const frameworks: readonly Framework[] = [
  {
    name: "gelis",

    file: resolve(HERE, "servers/gelis.ts"),
  },

  {
    name: "hono",

    file: resolve(HERE, "servers/hono.ts"),
  },

  {
    name: "elysia",

    file: resolve(HERE, "servers/elysia.ts"),

    env: {
      PRECOMPILE: "false",
    },
  },

  {
    name: "elysia-precompile",

    file: resolve(HERE, "servers/elysia.ts"),

    env: {
      PRECOMPILE: "true",
    },
  },
];

const cases = [
  "raw-response",
  "json",
  "text",
  "validate-json",
  "status-json",
] as const;

type FrameworkName = (typeof frameworks)[number]["name"];

type CaseName = (typeof cases)[number];

const CASE_FILTER = process.env.BENCH_CASE?.trim();

const selectedCases: readonly CaseName[] =
  CASE_FILTER === undefined || CASE_FILTER.length === 0
    ? cases
    : cases.filter((benchmarkCase) => benchmarkCase === CASE_FILTER);

if (selectedCases.length === 0) {
  throw new Error(`Unknown response comparison case: ${CASE_FILTER}`);
}

interface RawResult {
  readonly framework: FrameworkName;

  readonly case: CaseName;

  readonly sample: number;

  readonly requestsPerSecond: number;

  readonly p50: number;

  readonly p95: number;

  readonly p99: number;

  readonly successRate: number;
}

interface AggregateRow {
  readonly framework: FrameworkName;

  readonly case: CaseName;

  readonly requestsMedian: number;

  readonly requestsMin: number;

  readonly requestsMax: number;

  readonly requestsCv: number;

  /*
   * Median paired throughput difference against
   * Gelis for the same sample number.
   *
   * Positive means this framework was faster
   * than Gelis.
   */
  readonly versusGelisPercent: number;

  readonly p50: number;

  readonly p95: number;

  readonly p99: number;

  readonly successRate: number;
}

interface OhaJson {
  readonly metrics?: {
    readonly requests_per_sec?: number;

    readonly success_rate?: number;

    readonly latency_ms?: {
      readonly p50?: number;

      readonly p95?: number;

      readonly p99?: number;
    };
  };

  readonly summary?: {
    readonly requestsPerSec?: number;

    readonly successRate?: number;
  };

  readonly latencyPercentiles?: {
    readonly p50?: number;

    readonly p95?: number;

    readonly p99?: number;
  };
}

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

const OHA_VERSION = await getOhaVersion();

const urlSet = generateUrls();

const rawResults: RawResult[] = [];

for (let caseIndex = 0; caseIndex < selectedCases.length; caseIndex++) {
  const benchmarkCase = selectedCases[caseIndex];

  if (benchmarkCase === undefined) {
    continue;
  }

  for (let sample = 0; sample < SAMPLES; sample++) {
    /*
     * Rotate framework order every sample so one
     * framework does not systematically receive
     * the hottest or coldest machine state.
     */
    const order = rotate(frameworks, sample + caseIndex);

    for (const framework of order) {
      const result = await runFramework(
        framework,
        benchmarkCase,
        sample,
        urlSet,
      );

      rawResults.push(result);

      console.log(
        [
          framework.name,

          benchmarkCase,

          `sample ${sample + 1}/${SAMPLES}`,

          `${formatInteger(result.requestsPerSecond)} req/s`,
        ].join(" | "),
      );
    }
  }
}

const rows = aggregate(rawResults);

console.log("\nGelis response cross-framework HTTP benchmark");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`oha:         ${OHA_VERSION}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Hono:        ${packageVersion("hono")}`);

console.log(`Elysia:      ${packageVersion("elysia")}`);

console.log(`Routes:      ${ROUTES}`);

console.log(`Connections: ${CONNECTIONS}`);

console.log(`Samples:     ${SAMPLES}`);

console.log(`Warmup:      ${WARMUP_DURATION}`);

console.log(`Duration:    ${DURATION}\n`);

console.log("Throughput\n");

console.table(
  rows.map((row) => ({
    framework: row.framework,

    case: row.case,

    "req/s median": formatInteger(row.requestsMedian),

    "req/s min": formatInteger(row.requestsMin),

    "req/s max": formatInteger(row.requestsMax),

    "vs Gelis %": round(row.versusGelisPercent, 2),

    "CV %": round(row.requestsCv * 100, 2),
  })),
);

console.log("\nLatency medians\n");

console.table(
  rows.map((row) => ({
    framework: row.framework,

    case: row.case,

    "p50 ms": round(row.p50, 3),

    "p95 ms": round(row.p95, 3),

    "p99 ms": round(row.p99, 3),

    success: `${round(row.successRate * 100, 2)}%`,
  })),
);

console.log(
  "\nPositive 'vs Gelis %' means the framework was faster than Gelis.",
);

console.log("Negative 'vs Gelis %' means Gelis was faster.");

const output = {
  metadata: {
    generatedAt: new Date().toISOString(),

    bun: Bun.version,

    oha: OHA_VERSION,

    cpu: cpus()[0]?.model ?? "unknown",

    routes: ROUTES,

    connections: CONNECTIONS,

    samples: SAMPLES,

    warmupConnections: WARMUP_CONNECTIONS,

    warmupDuration: WARMUP_DURATION,

    duration: DURATION,

    versions: {
      hono: packageVersion("hono"),

      elysia: packageVersion("elysia"),
    },
  },

  results: rows,

  raw: rawResults,
};

writeFileSync(
  resolve(RESULTS_DIR, "latest-response-comparison.json"),

  `${JSON.stringify(output, null, 2)}\n`,
);

console.log(
  "\nRaw results: bench/http/results/latest-response-comparison.json",
);

function generateUrls(): {
  readonly urls: string[];

  readonly file: string;

  readonly readinessUrl: string;
} {
  const urls: string[] = [];

  for (let index = 0; index < ROUTES; index++) {
    urls.push(`http://127.0.0.1:${PORT}/r/${index}`);
  }

  const file = resolve(GENERATED_DIR, "response-comparison-static.txt");

  writeFileSync(
    file,

    `${urls.join("\n")}\n`,
  );

  const readinessUrl = urls[0];

  if (readinessUrl === undefined) {
    throw new Error("No response comparison URLs generated");
  }

  return {
    urls,
    file,
    readinessUrl,
  };
}

async function runFramework(
  framework: (typeof frameworks)[number],

  benchmarkCase: CaseName,

  sample: number,

  urlSet: {
    readonly urls: readonly string[];

    readonly file: string;

    readonly readinessUrl: string;
  },
): Promise<RawResult> {
  const server = Bun.spawn(
    [process.execPath, framework.file],

    {
      cwd: ROOT,

      env: {
        ...process.env,

        ...framework.env,

        PORT: String(PORT),

        ROUTES: String(ROUTES),

        CASE: benchmarkCase,
      },

      stdout: "ignore",

      stderr: "inherit",
    },
  );

  try {
    await waitForServer(urlSet.readinessUrl);

    await checkCorrectness(
      urlSet.readinessUrl,

      benchmarkCase,
    );

    await prewarmRoutes(urlSet.urls);

    await runOha(
      urlSet.file,

      WARMUP_DURATION,

      WARMUP_CONNECTIONS,
    );

    const result = await runOha(
      urlSet.file,

      DURATION,

      CONNECTIONS,
    );

    const successRate = getSuccessRate(result);

    if (successRate !== 1) {
      throw new Error(
        `${framework.name} ${benchmarkCase} success rate: ${successRate}`,
      );
    }

    return {
      framework: framework.name,

      case: benchmarkCase,

      sample,

      requestsPerSecond: getRequestsPerSecond(result),

      p50: getLatencyPercentile(result, "p50"),

      p95: getLatencyPercentile(result, "p95"),

      p99: getLatencyPercentile(result, "p99"),

      successRate,
    };
  } finally {
    server.kill();

    await server.exited;

    await sleep(100);
  }
}

async function waitForServer(url: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(url);

      if (response.status >= 200 && response.status < 400) {
        await response.arrayBuffer();

        return;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(25);
  }

  throw new Error(
    "Response comparison server did not become ready",

    {
      cause: lastError,
    },
  );
}

async function checkCorrectness(
  url: string,

  benchmarkCase: CaseName,
): Promise<void> {
  const response = await fetch(url);

  const body = await response.text();

  const contentType = response.headers.get("content-type");

  switch (benchmarkCase) {
    case "raw-response": {
      assertEqual(response.status, 204, "raw-response status");

      assertEqual(body, "", "raw-response body");

      assertEqual(contentType, null, "raw-response content-type");

      return;
    }

    case "json": {
      assertEqual(response.status, 200, "json status");

      assertEqual(
        body,

        JSON.stringify({
          id: "user-1",

          name: "Gelis",
        }),

        "json body",
      );

      assertEqual(
        contentType,

        "application/json;charset=utf-8",

        "json content-type",
      );

      return;
    }

    case "text": {
      assertEqual(response.status, 200, "text status");

      assertEqual(body, "created", "text body");

      assertEqual(
        contentType,

        "text/plain; charset=utf-8",

        "text content-type",
      );

      return;
    }

    case "validate-json": {
      assertEqual(response.status, 200, "validate-json status");

      assertEqual(
        body,

        JSON.stringify({
          id: "user-1",

          name: "Gelis",

          normalized: true,
        }),

        "validate-json body",
      );

      assertEqual(
        contentType,

        "application/json;charset=utf-8",

        "validate-json content-type",
      );

      return;
    }

    case "status-json": {
      assertEqual(response.status, 201, "status-json status");

      assertEqual(
        body,

        JSON.stringify({
          id: "user-1",

          name: "Gelis",
        }),

        "status-json body",
      );

      assertEqual(
        contentType,

        "application/json;charset=utf-8",

        "status-json content-type",
      );

      return;
    }
  }
}

async function prewarmRoutes(urls: readonly string[]): Promise<void> {
  for (let start = 0; start < urls.length; start += PREWARM_BATCH_SIZE) {
    const batch = urls.slice(
      start,

      start + PREWARM_BATCH_SIZE,
    );

    await Promise.all(
      batch.map(async (url) => {
        const response = await fetch(url);

        if (response.status < 200 || response.status >= 400) {
          throw new Error(`Prewarm failed: ${url} -> ${response.status}`);
        }

        await response.arrayBuffer();
      }),
    );
  }
}

async function runOha(
  urlFile: string,

  duration: string,

  connections: number,
): Promise<OhaJson> {
  const child = Bun.spawn(
    [
      "oha",

      "--no-tui",

      "--output-format",
      "json",

      "--wait-ongoing-requests-after-deadline",

      "--urls-from-file",

      "-z",
      duration,

      "-c",
      String(connections),

      "-m",
      "GET",

      urlFile,
    ],

    {
      cwd: ROOT,

      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdout = await new Response(child.stdout).text();

  const stderr = await new Response(child.stderr).text();

  const exitCode = await child.exited;

  if (exitCode !== 0) {
    throw new Error(`oha exited with ${exitCode}\n${stderr}`);
  }

  const parsed: unknown = JSON.parse(stdout);

  if (parsed === null || typeof parsed !== "object") {
    throw new Error("oha output must be a JSON object");
  }

  return parsed as OhaJson;
}

function aggregate(results: readonly RawResult[]): AggregateRow[] {
  const rows: AggregateRow[] = [];

  for (const benchmarkCase of selectedCases) {
    const caseResults = results.filter(
      (result) => result.case === benchmarkCase,
    );

    const gelisBySample = new Map<number, number>();

    for (const result of caseResults) {
      if (result.framework === "gelis") {
        gelisBySample.set(
          result.sample,

          result.requestsPerSecond,
        );
      }
    }

    for (const framework of frameworks) {
      const group = caseResults.filter(
        (result) => result.framework === framework.name,
      );

      if (group.length === 0) {
        continue;
      }

      const requests = group.map((result) => result.requestsPerSecond);

      const relative =
        framework.name === "gelis"
          ? [0]
          : group.map((result) => {
              const gelis = gelisBySample.get(result.sample);

              if (gelis === undefined) {
                throw new Error(
                  `Missing Gelis comparison sample ${result.sample} for ${benchmarkCase}`,
                );
              }

              return (result.requestsPerSecond / gelis - 1) * 100;
            });

      rows.push({
        framework: framework.name,

        case: benchmarkCase,

        requestsMedian: median(requests),

        requestsMin: Math.min(...requests),

        requestsMax: Math.max(...requests),

        requestsCv: coefficientOfVariation(requests),

        versusGelisPercent: median(relative),

        p50: median(group.map((result) => result.p50)),

        p95: median(group.map((result) => result.p95)),

        p99: median(group.map((result) => result.p99)),

        successRate: median(group.map((result) => result.successRate)),
      });
    }
  }

  return rows;
}

function getRequestsPerSecond(result: OhaJson): number {
  const value =
    result.metrics?.requests_per_sec ?? result.summary?.requestsPerSec;

  if (typeof value !== "number") {
    throw new Error("Missing oha requests/sec");
  }

  return value;
}

function getSuccessRate(result: OhaJson): number {
  const value = result.metrics?.success_rate ?? result.summary?.successRate;

  if (typeof value !== "number") {
    throw new Error("Missing oha success rate");
  }

  return value;
}

function getLatencyPercentile(
  result: OhaJson,

  percentile: "p50" | "p95" | "p99",
): number {
  const value =
    result.metrics?.latency_ms?.[percentile] ??
    result.latencyPercentiles?.[percentile];

  if (typeof value !== "number") {
    throw new Error(`Missing oha latency percentile ${percentile}`);
  }

  return value;
}

async function getOhaVersion(): Promise<string> {
  const child = Bun.spawn(
    ["oha", "--version"],

    {
      cwd: ROOT,

      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdout = await new Response(child.stdout).text();

  const stderr = await new Response(child.stderr).text();

  const exitCode = await child.exited;

  if (exitCode !== 0) {
    throw new Error(`oha is unavailable\n${stderr}`);
  }

  return stdout.trim();
}

function packageVersion(packageName: string): string {
  const path = resolve(ROOT, "node_modules", packageName, "package.json");

  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("version" in parsed) ||
    typeof (
      parsed as {
        version?: unknown;
      }
    ).version !== "string"
  ) {
    throw new Error(`Missing version for ${packageName}`);
  }

  return (
    parsed as {
      version: string;
    }
  ).version;
}

function rotate<Value>(
  values: readonly Value[],

  offset: number,
): Value[] {
  if (values.length === 0) {
    return [];
  }

  const normalized = offset % values.length;

  return [...values.slice(normalized), ...values.slice(0, normalized)];
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute median of empty values");
  }

  const sorted = [...values].sort((left, right) => left - right);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    const value = sorted[middle];

    if (value === undefined) {
      throw new Error("Missing median value");
    }

    return value;
  }

  const left = sorted[middle - 1];

  const right = sorted[middle];

  if (left === undefined || right === undefined) {
    throw new Error("Missing median values");
  }

  return (left + right) / 2;
}

function coefficientOfVariation(values: readonly number[]): number {
  const average =
    values.reduce((total, value) => total + value, 0) / values.length;

  if (average === 0) {
    return 0;
  }

  const variance =
    values.reduce((total, value) => {
      const delta = value - average;

      return total + delta * delta;
    }, 0) / values.length;

  return Math.sqrt(variance) / average;
}

function assertEqual<Value>(
  actual: Value,

  expected: Value,

  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

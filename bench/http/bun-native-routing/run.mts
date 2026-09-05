import { mkdirSync, writeFileSync } from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../../..");

const RESULTS_DIR = resolve(HERE, "../results");

const GENERATED_DIR = resolve(HERE, "../generated/bun-native-routing");

const PORT = 3100;

const ROUTES = 5000;

const SAMPLES = 7;

const CONNECTIONS = 50;

const WARMUP_CONNECTIONS = 10;

const WARMUP_DURATION = "2s";

const DURATION = "10s";

const PREWARM_BATCH_SIZE = 100;

type RouteKind = "static" | "dynamic";

type BodyKind = "raw" | "json";

interface BenchmarkCase {
  readonly routeKind: RouteKind;

  readonly bodyKind: BodyKind;
}

interface Framework {
  readonly name: "current" | "native";

  readonly file: string;
}

interface UrlSet {
  readonly urls: string[];

  readonly file: string;

  readonly readinessUrl: string;
}

interface ResultRow {
  readonly framework: Framework["name"];

  readonly routeKind: RouteKind;

  readonly bodyKind: BodyKind;

  readonly sample: number;

  readonly requestsPerSecond: number;

  readonly p50: number;

  readonly p95: number;

  readonly p99: number;

  readonly successRate: number;
}

interface AggregateRow {
  readonly framework: Framework["name"];

  readonly routeKind: RouteKind;

  readonly bodyKind: BodyKind;

  readonly requestsMedian: number;

  readonly requestsMin: number;

  readonly requestsMax: number;

  readonly requestsCv: number;

  readonly p50: number;

  readonly p95: number;

  readonly p99: number;

  readonly successRate: number;

  readonly samples: number[];
}

interface ComparisonRow {
  readonly case: string;

  readonly current: number;

  readonly native: number;

  readonly nativeDelta: number;
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

const frameworks = [
  {
    name: "current",

    file: resolve(HERE, "current.ts"),
  },

  {
    name: "native",

    file: resolve(HERE, "native.ts"),
  },
] as const satisfies readonly Framework[];

const cases = [
  {
    routeKind: "static",

    bodyKind: "raw",
  },

  {
    routeKind: "dynamic",

    bodyKind: "raw",
  },

  {
    routeKind: "static",

    bodyKind: "json",
  },

  {
    routeKind: "dynamic",

    bodyKind: "json",
  },
] as const satisfies readonly BenchmarkCase[];

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

mkdirSync(GENERATED_DIR, {
  recursive: true,
});

await ensureOha();

const urlSets = generateUrlSets();

const rawResults: ResultRow[] = [];

for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
  const benchmarkCase = cases[caseIndex];

  if (!benchmarkCase) {
    continue;
  }

  const urlSet = urlSets[benchmarkCase.routeKind];

  for (let sample = 0; sample < SAMPLES; sample++) {
    /*
     * Rotate current/native on every sample.
     *
     * Also offset by case index so the same
     * implementation does not always run first
     * at the beginning of a new workload.
     */
    const order = rotate(
      frameworks,

      sample + caseIndex,
    );

    for (const framework of order) {
      const result = await runFramework(
        framework,

        benchmarkCase,

        urlSet,

        sample,
      );

      rawResults.push(result);

      console.log(
        [
          framework.name,

          `${benchmarkCase.routeKind}-${benchmarkCase.bodyKind}`,

          `sample ${sample + 1}/${SAMPLES}`,

          `${Math.round(result.requestsPerSecond).toLocaleString(
            "en-US",
          )} req/s`,
        ].join(" | "),
      );
    }
  }
}

const rows = aggregate(rawResults);

const comparisons = compare(rows);

const metadata = {
  generatedAt: new Date().toISOString(),

  runtime: `bun ${Bun.version}`,

  oha: await getOhaVersion(),

  cpu: cpus()[0]?.model ?? "unknown",

  routes: ROUTES,

  connections: CONNECTIONS,

  samples: SAMPLES,

  warmupConnections: WARMUP_CONNECTIONS,

  warmupDuration: WARMUP_DURATION,

  duration: DURATION,
};

console.log("\nGelis P5-C — Bun native routing experiment");

console.log(`Runtime:     ${metadata.runtime}`);

console.log(`oha:         ${metadata.oha}`);

console.log(`CPU:         ${metadata.cpu}`);

console.log(`Routes:      ${metadata.routes}`);

console.log(`Connections: ${metadata.connections}`);

console.log(`Samples:     ${metadata.samples}`);

console.log(
  `Warmup:      ${metadata.warmupDuration} / ${metadata.warmupConnections} connections`,
);

console.log(
  `Measure:     ${metadata.duration} / ${metadata.connections} connections\n`,
);

console.table(
  rows.map((row) => ({
    framework: row.framework,

    case: `${row.routeKind}-${row.bodyKind}`,

    "req/s median": formatInteger(row.requestsMedian),

    "req/s min": formatInteger(row.requestsMin),

    "req/s max": formatInteger(row.requestsMax),

    "cv %": round(
      row.requestsCv * 100,

      2,
    ),

    "p50 ms": round(
      row.p50,

      3,
    ),

    "p95 ms": round(
      row.p95,

      3,
    ),

    "p99 ms": round(
      row.p99,

      3,
    ),

    success: `${round(
      row.successRate * 100,

      2,
    )}%`,
  })),
);

console.log("\nNative routing delta vs current Gelis\n");

console.table(
  comparisons.map((row) => ({
    case: row.case,

    current: formatInteger(row.current),

    native: formatInteger(row.native),

    "native delta %": round(
      row.nativeDelta * 100,

      2,
    ),
  })),
);

const output = {
  metadata,

  results: rows,

  comparisons,

  raw: rawResults,
};

writeFileSync(
  resolve(
    RESULTS_DIR,

    "bun-native-routing-latest.json",
  ),

  `${JSON.stringify(
    output,

    null,

    2,
  )}\n`,
);

console.log("\nRaw results: bench/http/results/bun-native-routing-latest.json");

function generateUrlSets(): Record<RouteKind, UrlSet> {
  const staticUrls: string[] = [];

  const dynamicUrls: string[] = [];

  for (let index = 0; index < ROUTES; index++) {
    staticUrls.push(`http://127.0.0.1:${PORT}/r/${index}`);

    dynamicUrls.push(`http://127.0.0.1:${PORT}/r/${index}/target-${index}`);
  }

  const staticFile = resolve(
    GENERATED_DIR,

    "static-urls.txt",
  );

  const dynamicFile = resolve(
    GENERATED_DIR,

    "dynamic-urls.txt",
  );

  writeFileSync(
    staticFile,

    `${staticUrls.join("\n")}\n`,
  );

  writeFileSync(
    dynamicFile,

    `${dynamicUrls.join("\n")}\n`,
  );

  return {
    static: {
      urls: staticUrls,

      file: staticFile,

      readinessUrl: staticUrls[0] ?? `http://127.0.0.1:${PORT}/r/0`,
    },

    dynamic: {
      urls: dynamicUrls,

      file: dynamicFile,

      readinessUrl: dynamicUrls[0] ?? `http://127.0.0.1:${PORT}/r/0/target-0`,
    },
  };
}

async function runFramework(
  framework: Framework,

  benchmarkCase: BenchmarkCase,

  urlSet: UrlSet,

  sample: number,
): Promise<ResultRow> {
  const server = Bun.spawn(
    [process.execPath, framework.file],

    {
      cwd: ROOT,

      env: {
        ...process.env,

        PORT: String(PORT),

        ROUTES: String(ROUTES),

        ROUTE_KIND: benchmarkCase.routeKind,

        BODY_KIND: benchmarkCase.bodyKind,
      },

      stdout: "ignore",

      stderr: "inherit",
    },
  );

  try {
    await waitForServer(urlSet.readinessUrl);

    /*
     * Exercise every registered route once.
     *
     * We want steady-state routing rather than
     * measuring first-route/JIT behavior.
     */
    await prewarmAllRoutes(urlSet.urls);

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
      throw new Error(`${framework.name} success rate: ${successRate}`);
    }

    return {
      framework: framework.name,

      routeKind: benchmarkCase.routeKind,

      bodyKind: benchmarkCase.bodyKind,

      sample,

      requestsPerSecond: getRequestsPerSecond(result),

      p50: getLatencyPercentile(
        result,

        "p50",
      ),

      p95: getLatencyPercentile(
        result,

        "p95",
      ),

      p99: getLatencyPercentile(
        result,

        "p99",
      ),

      successRate,
    };
  } finally {
    server.kill();

    await server.exited;

    await sleep(100);
  }
}

async function prewarmAllRoutes(urls: string[]): Promise<void> {
  for (let start = 0; start < urls.length; start += PREWARM_BATCH_SIZE) {
    const batch = urls.slice(
      start,

      start + PREWARM_BATCH_SIZE,
    );

    await Promise.all(
      batch.map(async (url) => {
        const response = await fetch(url);

        if (!response.ok) {
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

  return JSON.parse(stdout) as OhaJson;
}

async function waitForServer(url: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        await response.arrayBuffer();

        return;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(25);
  }

  throw new Error(
    "Server did not become ready",

    {
      cause: lastError,
    },
  );
}

function aggregate(results: ResultRow[]): AggregateRow[] {
  const groups = new Map<string, ResultRow[]>();

  for (const result of results) {
    const key = [result.framework, result.routeKind, result.bodyKind].join(":");

    let group = groups.get(key);

    if (!group) {
      group = [];

      groups.set(
        key,

        group,
      );
    }

    group.push(result);
  }

  const rows: AggregateRow[] = [];

  for (const group of groups.values()) {
    const first = group[0];

    if (!first) {
      continue;
    }

    const rates = group.map((result) => result.requestsPerSecond);

    rows.push({
      framework: first.framework,

      routeKind: first.routeKind,

      bodyKind: first.bodyKind,

      requestsMedian: median(rates),

      requestsMin: Math.min(...rates),

      requestsMax: Math.max(...rates),

      requestsCv: coefficientOfVariation(rates),

      p50: median(group.map((result) => result.p50)),

      p95: median(group.map((result) => result.p95)),

      p99: median(group.map((result) => result.p99)),

      successRate: median(group.map((result) => result.successRate)),

      samples: rates,
    });
  }

  return rows;
}

function compare(rows: AggregateRow[]): ComparisonRow[] {
  const result: ComparisonRow[] = [];

  for (const benchmarkCase of cases) {
    const current = rows.find(
      (row) =>
        row.framework === "current" &&
        row.routeKind === benchmarkCase.routeKind &&
        row.bodyKind === benchmarkCase.bodyKind,
    );

    const native = rows.find(
      (row) =>
        row.framework === "native" &&
        row.routeKind === benchmarkCase.routeKind &&
        row.bodyKind === benchmarkCase.bodyKind,
    );

    if (!current || !native) {
      throw new Error(
        `Missing aggregate result for ${benchmarkCase.routeKind}-${benchmarkCase.bodyKind}`,
      );
    }

    result.push({
      case: `${benchmarkCase.routeKind}-${benchmarkCase.bodyKind}`,

      current: current.requestsMedian,

      native: native.requestsMedian,

      nativeDelta: native.requestsMedian / current.requestsMedian - 1,
    });
  }

  return result;
}

function getRequestsPerSecond(result: OhaJson): number {
  const value =
    result.metrics?.requests_per_sec ?? result.summary?.requestsPerSec;

  if (typeof value !== "number") {
    throw new Error("Unable to read oha requests/sec");
  }

  return value;
}

function getSuccessRate(result: OhaJson): number {
  const value = result.metrics?.success_rate ?? result.summary?.successRate;

  if (typeof value !== "number") {
    throw new Error("Unable to read oha success rate");
  }

  return value;
}

function getLatencyPercentile(
  result: OhaJson,

  percentile: "p50" | "p95" | "p99",
): number {
  const metricValue = result.metrics?.latency_ms?.[percentile];

  if (typeof metricValue === "number") {
    return metricValue;
  }

  const legacyValue = result.latencyPercentiles?.[percentile];

  if (typeof legacyValue === "number") {
    return legacyValue * 1000;
  }

  throw new Error(`Unable to read oha ${percentile}`);
}

function coefficientOfVariation(values: number[]): number {
  const average = mean(values);

  if (average === 0) {
    return 0;
  }

  const variance =
    values.reduce(
      (
        total,

        value,
      ) => {
        const difference = value - average;

        return total + difference * difference;
      },

      0,
    ) / values.length;

  return Math.sqrt(variance) / average;
}

function mean(values: number[]): number {
  return (
    values.reduce(
      (
        total,

        value,
      ) => total + value,

      0,
    ) / values.length
  );
}

function rotate<T>(
  values: readonly T[],

  offset: number,
): T[] {
  const index = offset % values.length;

  return [
    ...values.slice(index),

    ...values.slice(
      0,

      index,
    ),
  ];
}

function median(values: number[]): number {
  const sorted = [...values].sort(
    (
      left,

      right,
    ) => left - right,
  );

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    const value = sorted[middle];

    if (value === undefined) {
      throw new Error("Cannot compute median of empty values");
    }

    return value;
  }

  const left = sorted[middle - 1];

  const right = sorted[middle];

  if (left === undefined || right === undefined) {
    throw new Error("Cannot compute median of empty values");
  }

  return (left + right) / 2;
}

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

async function ensureOha(): Promise<void> {
  const process = Bun.spawn(
    ["oha", "--version"],

    {
      stdout: "ignore",

      stderr: "ignore",
    },
  );

  const exitCode = await process.exited;

  if (exitCode !== 0) {
    throw new Error("oha is required for this benchmark");
  }
}

async function getOhaVersion(): Promise<string> {
  const process = Bun.spawn(
    ["oha", "--version"],

    {
      stdout: "pipe",

      stderr: "ignore",
    },
  );

  const output = await new Response(process.stdout).text();

  await process.exited;

  return output.trim();
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(
      resolvePromise,

      milliseconds,
    );
  });
}

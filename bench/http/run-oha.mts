import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const RESULTS_DIR = resolve(HERE, "results");

const GENERATED_DIR = resolve(HERE, "generated");

const PORT = 3100;

const ROUTES = 5000;

const SAMPLES = 7;

const CONNECTIONS = 50;

const WARMUP_CONNECTIONS = 10;

const WARMUP_DURATION = "2s";

const DURATION = "10s";

const PREWARM_BATCH_SIZE = 100;

interface MixedHttpFramework {
  readonly name: string;
  readonly file: string;
  readonly env?: Record<string, string>;
}

const frameworks = [
  {
    name: "gelis",

    file: resolve(HERE, "servers/gelis.ts"),
  },

  {
    name: "hono",

    file: resolve(HERE, "servers/hono.ts"),
  },

  {
    name: "elysia-1",

    file: resolve(HERE, "servers/elysia.ts"),

    env: {
      PRECOMPILE: "false",
    },
  },

  {
    name: "elysia-1-precompile",

    file: resolve(HERE, "servers/elysia.ts"),

    env: {
      PRECOMPILE: "true",
    },
  },

  {
    name: "elysia-2",

    file: resolve(HERE, "servers/elysia-v2.ts"),
  },
] as const satisfies readonly MixedHttpFramework[];

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
] as const satisfies readonly HttpRouteCase[];

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

mkdirSync(GENERATED_DIR, {
  recursive: true,
});

await ensureOha();

const urlSets = generateUrlSets();

const rawResults: HttpRouteResultRow[] = [];

for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
  const benchmarkCase = cases[caseIndex];

  if (!benchmarkCase) {
    continue;
  }

  const urlSet = urlSets[benchmarkCase.routeKind];

  if (!urlSet) {
    throw new Error(`Missing URL set for ${benchmarkCase.routeKind}`);
  }

  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = rotate(frameworks, sample + caseIndex);

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

console.log("\nGelis HTTP benchmark — oha mixed routes");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`oha:         ${await getOhaVersion()}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Hono:        ${packageVersion("hono")}`);

console.log(`Elysia 1:    ${packageVersion("elysia")}`);

console.log(`Elysia 2:    ${packageVersion("elysia-v2")}`);

console.log(`Routes:      ${ROUTES}`);

console.log(`Connections: ${CONNECTIONS}`);

console.log(`Samples:     ${SAMPLES}`);

console.log("Workload:    mixed-all\n");

console.table(
  rows.map((row) => ({
    framework: row.framework,

    case: `${row.routeKind}-${row.bodyKind}`,

    "req/s median": formatInteger(row.requestsMedian),

    "req/s min": formatInteger(row.requestsMin),

    "req/s max": formatInteger(row.requestsMax),

    "cv %": round(row.requestsCv * 100, 2),

    "p50 ms": round(row.p50, 3),

    "p95 ms": round(row.p95, 3),

    "p99 ms": round(row.p99, 3),

    success: `${round(row.successRate * 100, 2)}%`,
  })),
);

const output = {
  metadata: {
    generatedAt: new Date().toISOString(),

    workload: "mixed-all",

    bun: Bun.version,

    oha: await getOhaVersion(),

    cpu: cpus()[0]?.model ?? "unknown",

    routes: ROUTES,

    samples: SAMPLES,

    connections: CONNECTIONS,

    warmupConnections: WARMUP_CONNECTIONS,

    warmupDuration: WARMUP_DURATION,

    duration: DURATION,

    versions: {
      hono: packageVersion("hono"),

      elysia1: packageVersion("elysia"),

      elysia2: packageVersion("elysia-v2"),
    },
  },

  results: rows,

  raw: rawResults,
};

writeFileSync(
  resolve(RESULTS_DIR, "latest-oha-mixed.json"),

  `${JSON.stringify(output, null, 2)}\n`,
);

console.log("\nRaw results: " + "bench/http/results/latest-oha-mixed.json");

function generateUrlSets(): Record<HttpRouteCase["routeKind"], UrlSet> {
  const staticUrls: string[] = [];
  const dynamicUrls: string[] = [];

  for (let index = 0; index < ROUTES; index++) {
    staticUrls.push(`http://127.0.0.1:${PORT}/r/${index}`);

    dynamicUrls.push(`http://127.0.0.1:${PORT}/r/${index}/target-${index}`);
  }

  const staticFile = resolve(GENERATED_DIR, "static-urls.txt");

  const dynamicFile = resolve(GENERATED_DIR, "dynamic-urls.txt");

  writeUrlFile(staticFile, staticUrls);

  writeUrlFile(dynamicFile, dynamicUrls);

  return {
    static: {
      urls: staticUrls,

      file: staticFile,

      readinessUrl: firstUrl(staticUrls, "static"),
    },

    dynamic: {
      urls: dynamicUrls,

      file: dynamicFile,

      readinessUrl: firstUrl(dynamicUrls, "dynamic"),
    },
  };
}

function writeUrlFile(path: string, urls: string[]): void {
  writeFileSync(path, `${urls.join("\n")}\n`);
}

async function runFramework(
  framework: MixedHttpFramework,
  benchmarkCase: HttpRouteCase,
  urlSet: UrlSet,
  sample: number,
): Promise<HttpRouteResultRow> {
  const server = Bun.spawn(
    [process.execPath, framework.file],

    {
      cwd: ROOT,

      env: {
        ...process.env,
        ...framework.env,

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
     * Touch every route once before measuring.
     *
     * This makes the comparison a steady-state
     * routing benchmark instead of accidentally
     * measuring first-request/JIT compilation.
     */
    await prewarmAllRoutes(urlSet.urls);

    /*
     * Short load warmup after every route has
     * already been exercised.
     */
    await runOha(urlSet.file, WARMUP_DURATION, WARMUP_CONNECTIONS);

    const result = await runOha(urlSet.file, DURATION, CONNECTIONS);

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

async function prewarmAllRoutes(urls: string[]): Promise<void> {
  for (let start = 0; start < urls.length; start += PREWARM_BATCH_SIZE) {
    const batch = urls.slice(start, start + PREWARM_BATCH_SIZE);

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

  const json: unknown = JSON.parse(stdout);

  return toOhaJson(json);
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

  throw new Error("Server did not become ready", {
    cause: lastError,
  });
}

function aggregate(results: HttpRouteResultRow[]): HttpRouteAggregateRow[] {
  const groups = new Map<string, HttpRouteResultRow[]>();

  for (const result of results) {
    const key = [result.framework, result.routeKind, result.bodyKind].join(":");

    let group = groups.get(key);

    if (!group) {
      group = [];

      groups.set(key, group);
    }

    group.push(result);
  }

  const rows: HttpRouteAggregateRow[] = [];

  for (const group of groups.values()) {
    const first = group[0];

    if (!first) {
      continue;
    }

    const requestRates = group.map((result) => result.requestsPerSecond);

    rows.push({
      framework: first.framework,

      routeKind: first.routeKind,

      bodyKind: first.bodyKind,

      requestsMedian: median(requestRates),

      requestsMin: Math.min(...requestRates),

      requestsMax: Math.max(...requestRates),

      requestsCv: coefficientOfVariation(requestRates),

      p50: median(group.map((result) => result.p50)),

      p95: median(group.map((result) => result.p95)),

      p99: median(group.map((result) => result.p99)),

      successRate: median(group.map((result) => result.successRate)),

      samples: requestRates,
    });
  }

  return rows;
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
      (total, value) => {
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
      (total, value) => total + value,

      0,
    ) / values.length
  );
}

function rotate<T>(values: readonly T[], offset: number): T[] {
  const index = offset % values.length;

  return [...values.slice(index), ...values.slice(0, index)];
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

async function ensureOha(): Promise<void> {
  const child = Bun.spawn(
    ["oha", "--version"],

    {
      stdout: "ignore",

      stderr: "ignore",
    },
  );

  const exitCode = await child.exited;

  if (exitCode !== 0) {
    throw new Error("oha is not installed or not in PATH");
  }
}

async function getOhaVersion(): Promise<string> {
  const child = Bun.spawn(
    ["oha", "--version"],

    {
      stdout: "pipe",

      stderr: "ignore",
    },
  );

  const output = await new Response(child.stdout).text();

  await child.exited;

  return output.trim();
}

function packageVersion(name: string): string {
  try {
    const path = resolve(ROOT, "node_modules", name, "package.json");

    return readPackageVersion(path);
  } catch {
    return "unknown";
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function firstUrl(urls: string[], label: string): string {
  const url = urls[0];

  if (url === undefined) {
    throw new Error(`No generated ${label} URLs`);
  }

  return url;
}

function toOhaJson(value: unknown): OhaJson {
  if (value === null || typeof value !== "object") {
    throw new Error("oha output must be a JSON object");
  }

  return value as OhaJson;
}

function readPackageVersion(packagePath: string): string {
  const parsed: unknown = JSON.parse(readFileSync(packagePath, "utf8"));

  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "version" in parsed &&
    typeof parsed.version === "string"
  ) {
    return parsed.version;
  }

  return "unknown";
}

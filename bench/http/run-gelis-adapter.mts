import { mkdirSync, writeFileSync } from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const RESULTS_DIR = resolve(HERE, "results");

const GENERATED_DIR = resolve(HERE, "generated");

const PORT = 3100;

const ROUTES = 5000;

const SAMPLES = 9;

const CONNECTIONS = 50;

const WARMUP_CONNECTIONS = 10;

const WARMUP_DURATION = "2s";

const DURATION = "10s";

const PREWARM_BATCH_SIZE = 100;

interface AdapterVariant {
  readonly name: "direct" | "adapter";
  readonly file: string;
}

interface AdapterResultRow {
  variant: AdapterVariant["name"];
  routeKind: HttpRouteCase["routeKind"];
  bodyKind: HttpRouteCase["bodyKind"];
  sample: number;
  requestsPerSecond: number;
  p50: number;
  p95: number;
  p99: number;
  successRate: number;
}

interface AdapterAggregateRow {
  variant: AdapterVariant["name"];
  routeKind: HttpRouteCase["routeKind"];
  bodyKind: HttpRouteCase["bodyKind"];
  requestsMedian: number;
  requestsMin: number;
  requestsMax: number;
  requestsCv: number;
  p50: number;
  p95: number;
  p99: number;
}

const variants = [
  {
    name: "direct",

    file: resolve(HERE, "servers/gelis.ts"),
  },

  {
    name: "adapter",

    file: resolve(HERE, "servers/gelis-adapter.ts"),
  },
] as const satisfies readonly AdapterVariant[];

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

const rawResults: AdapterResultRow[] = [];

for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
  const benchmarkCase = cases[caseIndex];

  if (!benchmarkCase) {
    continue;
  }

  const urlSet = urlSets[benchmarkCase.routeKind];

  if (!urlSet) {
    throw new Error("Missing URL set");
  }

  for (let sample = 0; sample < SAMPLES; sample++) {
    /*
     * Alternate order to reduce
     * systematic first/second-run bias.
     */
    const order = sample % 2 === 0 ? variants : [...variants].reverse();

    for (const variant of order) {
      const result = await runVariant(variant, benchmarkCase, urlSet, sample);

      rawResults.push(result);

      console.log(
        [
          variant.name,
          `${benchmarkCase.routeKind}-${benchmarkCase.bodyKind}`,
          `sample ${sample + 1}/${SAMPLES}`,
          `${formatInteger(result.requestsPerSecond)} req/s`,
        ].join(" | "),
      );
    }
  }
}

const rows = aggregate(rawResults);

console.log("\nGelis Bun adapter overhead benchmark");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`oha:         ${await getOhaVersion()}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Routes:      ${ROUTES}`);

console.log(`Connections: ${CONNECTIONS}`);

console.log(`Samples:     ${SAMPLES}`);

console.log("Workload:    mixed-all\n");

console.table(
  rows.map((row) => ({
    variant: row.variant,

    case: `${row.routeKind}-${row.bodyKind}`,

    "req/s median": formatInteger(row.requestsMedian),

    "req/s min": formatInteger(row.requestsMin),

    "req/s max": formatInteger(row.requestsMax),

    "cv %": round(row.requestsCv * 100, 2),

    "p50 ms": round(row.p50, 3),

    "p95 ms": round(row.p95, 3),

    "p99 ms": round(row.p99, 3),
  })),
);

printComparison(rows);

const output = {
  metadata: {
    generatedAt: new Date().toISOString(),

    bun: Bun.version,

    oha: await getOhaVersion(),

    cpu: cpus()[0]?.model ?? "unknown",

    routes: ROUTES,

    samples: SAMPLES,

    connections: CONNECTIONS,

    duration: DURATION,

    workload: "mixed-all",
  },

  results: rows,

  raw: rawResults,
};

writeFileSync(
  resolve(RESULTS_DIR, "latest-gelis-adapter.json"),

  `${JSON.stringify(output, null, 2)}\n`,
);

console.log("\nRaw results: " + "bench/http/results/latest-gelis-adapter.json");

function generateUrlSets(): Record<HttpRouteCase["routeKind"], UrlSet> {
  const staticUrls: string[] = [];
  const dynamicUrls: string[] = [];

  for (let index = 0; index < ROUTES; index++) {
    staticUrls.push(`http://127.0.0.1:${PORT}/r/${index}`);

    dynamicUrls.push(`http://127.0.0.1:${PORT}/r/${index}/target-${index}`);
  }

  const staticFile = resolve(GENERATED_DIR, "adapter-static-urls.txt");

  const dynamicFile = resolve(GENERATED_DIR, "adapter-dynamic-urls.txt");

  writeFileSync(staticFile, `${staticUrls.join("\n")}\n`);

  writeFileSync(dynamicFile, `${dynamicUrls.join("\n")}\n`);

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

async function runVariant(
  variant: AdapterVariant,
  benchmarkCase: HttpRouteCase,
  urlSet: UrlSet,
  sample: number,
): Promise<AdapterResultRow> {
  const server = Bun.spawn(
    [process.execPath, variant.file],

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

    await prewarmAllRoutes(urlSet.urls);

    await runOha(urlSet.file, WARMUP_DURATION, WARMUP_CONNECTIONS);

    const result = await runOha(urlSet.file, DURATION, CONNECTIONS);

    const successRate = getSuccessRate(result);

    if (successRate !== 1) {
      throw new Error(`${variant.name} success rate: ${successRate}`);
    }

    return {
      variant: variant.name,

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
          throw new Error(`Prewarm failed: ${url}`);
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

function aggregate(results: AdapterResultRow[]): AdapterAggregateRow[] {
  const groups = new Map<string, AdapterResultRow[]>();

  for (const result of results) {
    const key = [result.variant, result.routeKind, result.bodyKind].join(":");

    let group = groups.get(key);

    if (!group) {
      group = [];

      groups.set(key, group);
    }

    group.push(result);
  }

  const rows: AdapterAggregateRow[] = [];

  for (const group of groups.values()) {
    const first = group[0];

    if (!first) {
      continue;
    }

    const rates = group.map((result) => result.requestsPerSecond);

    rows.push({
      variant: first.variant,

      routeKind: first.routeKind,

      bodyKind: first.bodyKind,

      requestsMedian: median(rates),

      requestsMin: Math.min(...rates),

      requestsMax: Math.max(...rates),

      requestsCv: coefficientOfVariation(rates),

      p50: median(group.map((result) => result.p50)),

      p95: median(group.map((result) => result.p95)),

      p99: median(group.map((result) => result.p99)),
    });
  }

  return rows;
}

function printComparison(rows: AdapterAggregateRow[]): void {
  console.log("\nAdapter throughput delta:");

  for (const benchmarkCase of cases) {
    const direct = rows.find(
      (row) =>
        row.variant === "direct" &&
        row.routeKind === benchmarkCase.routeKind &&
        row.bodyKind === benchmarkCase.bodyKind,
    );

    const adapter = rows.find(
      (row) =>
        row.variant === "adapter" &&
        row.routeKind === benchmarkCase.routeKind &&
        row.bodyKind === benchmarkCase.bodyKind,
    );

    if (!direct || !adapter) {
      continue;
    }

    const delta = (adapter.requestsMedian / direct.requestsMedian - 1) * 100;

    console.log(
      `${benchmarkCase.routeKind}-${benchmarkCase.bodyKind}: ${formatSigned(
        delta,
      )}%`,
    );
  }
}

function getRequestsPerSecond(result: OhaJson): number {
  const value =
    result.metrics?.requests_per_sec ?? result.summary?.requestsPerSec;

  if (typeof value !== "number") {
    throw new Error("Unable to read requests/sec");
  }

  return value;
}

function getSuccessRate(result: OhaJson): number {
  const value = result.metrics?.success_rate ?? result.summary?.successRate;

  if (typeof value !== "number") {
    throw new Error("Unable to read success rate");
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

  throw new Error(`Unable to read ${percentile}`);
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

function formatSigned(value: number): string {
  const rounded = round(value, 2);

  return rounded >= 0 ? `+${rounded}` : String(rounded);
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

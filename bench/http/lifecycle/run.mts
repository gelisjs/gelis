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

const WARMUP_DURATION = "2s";

const DURATION = "10s";

interface LifecycleHttpFramework {
  readonly name: string;
  readonly file: string;
  readonly env?: Record<string, string>;
}

interface LifecycleHttpCase {
  readonly name: string;
  readonly query: boolean;
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
] as const satisfies readonly LifecycleHttpFramework[];

const cases = [
  {
    name: "plain",

    query: false,
  },

  {
    name: "before-sync",

    query: false,
  },

  {
    name: "before-async",

    query: false,
  },

  {
    name: "after-sync",

    query: false,
  },

  {
    name: "before-after-sync",

    query: false,
  },

  {
    name: "validation-before",

    query: true,
  },

  {
    name: "early-return",

    query: false,
  },
] as const satisfies readonly LifecycleHttpCase[];

const requestedCases = readListArgument("--cases");

const selectedCases =
  requestedCases.length === 0
    ? cases
    : cases.filter((benchmarkCase) =>
        requestedCases.includes(benchmarkCase.name),
      );

if (
  requestedCases.length !== 0 &&
  selectedCases.length !== requestedCases.length
) {
  const knownCases = new Set<string>(
    cases.map((benchmarkCase) => benchmarkCase.name),
  );

  const unknownCases = requestedCases.filter((name) => !knownCases.has(name));

  throw new Error(
    `Unknown lifecycle benchmark case(s): ${unknownCases.join(", ")}`,
  );
}

const selectedCaseNames = selectedCases.map(
  (benchmarkCase) => benchmarkCase.name,
);

const resultFileName =
  requestedCases.length === 0
    ? "latest-lifecycle.json"
    : `latest-lifecycle-${selectedCaseNames.join("-")}.json`;

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

mkdirSync(GENERATED_DIR, {
  recursive: true,
});

await ensureOha();

console.log(`Lifecycle cases: ${selectedCaseNames.join(", ")}`);

console.log(
  requestedCases.length === 0
    ? "Benchmark mode: full"
    : "Benchmark mode: filtered",
);

console.log("");

const rawResults: HttpCaseResultRow[] = [];

for (let caseIndex = 0; caseIndex < selectedCases.length; caseIndex++) {
  const benchmarkCase = selectedCases[caseIndex];

  if (!benchmarkCase) {
    continue;
  }

  const urlSet = generateUrls(benchmarkCase);

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
          benchmarkCase.name,
          `sample ${sample + 1}/${SAMPLES}`,
          `${formatInteger(result.requestsPerSecond)} req/s`,
        ].join(" | "),
      );
    }
  }
}

const rows = aggregate(rawResults);

console.log("\nGelis lifecycle HTTP benchmark");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`oha:         ${await getOhaVersion()}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Hono:        ${packageVersion("hono")}`);

console.log(`Hono std:    ${packageVersion("@hono/standard-validator")}`);

console.log(`Elysia:      ${packageVersion("elysia")}`);

console.log(`Routes:      ${ROUTES}`);

console.log(`Connections: ${CONNECTIONS}`);

console.log(`Samples:     ${SAMPLES}`);

console.log(`Cases:       ${selectedCaseNames.join(", ")}\n`);

console.table(
  rows.map((row) => ({
    framework: row.framework,

    case: row.case,

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

printGelisComparisons(rows);

const output = {
  metadata: {
    generatedAt: new Date().toISOString(),

    bun: Bun.version,

    oha: await getOhaVersion(),

    cpu: cpus()[0]?.model ?? "unknown",

    routes: ROUTES,

    connections: CONNECTIONS,

    samples: SAMPLES,

    duration: DURATION,

    warmupDuration: WARMUP_DURATION,

    cases: selectedCaseNames,

    filtered: requestedCases.length !== 0,

    versions: {
      hono: packageVersion("hono"),

      honoStandardValidator: packageVersion("@hono/standard-validator"),

      elysia: packageVersion("elysia"),
    },
  },

  results: rows,

  raw: rawResults,
};

writeFileSync(
  resolve(RESULTS_DIR, resultFileName),

  `${JSON.stringify(output, null, 2)}\n`,
);

console.log(`\nRaw results: bench/http/results/${resultFileName}`);

function generateUrls(benchmarkCase: LifecycleHttpCase): UrlSet {
  const urls: string[] = [];

  for (let index = 0; index < ROUTES; index++) {
    const query = benchmarkCase.query ? "?page=42&q=gelis" : "";

    urls.push(`http://127.0.0.1:${PORT}/r/${index}${query}`);
  }

  const file = resolve(
    GENERATED_DIR,

    `lifecycle-${benchmarkCase.name}.txt`,
  );

  writeFileSync(
    file,

    `${urls.join("\n")}\n`,
  );

  return {
    urls,
    file,

    readinessUrl: firstUrl(urls, benchmarkCase.name),
  };
}

async function runFramework(
  framework: LifecycleHttpFramework,
  benchmarkCase: LifecycleHttpCase,
  urlSet: UrlSet,
  sample: number,
): Promise<HttpCaseResultRow> {
  const server = Bun.spawn(
    [process.execPath, framework.file],

    {
      cwd: ROOT,

      env: {
        ...process.env,
        ...framework.env,

        PORT: String(PORT),

        ROUTES: String(ROUTES),

        CASE: benchmarkCase.name,
      },

      stdout: "ignore",

      stderr: "inherit",
    },
  );

  try {
    await waitForServer(urlSet.readinessUrl);

    await prewarmRoutes(urlSet.urls);

    await runOha(urlSet.file, WARMUP_DURATION, 10);

    const result = await runOha(urlSet.file, DURATION, CONNECTIONS);

    const successRate = getSuccessRate(result);

    if (successRate !== 1) {
      throw new Error(
        `${framework.name} ${benchmarkCase.name} ` +
          `success rate: ${successRate}`,
      );
    }

    return {
      framework: framework.name,

      case: benchmarkCase.name,

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

async function prewarmRoutes(urls: string[]): Promise<void> {
  const batchSize = 100;

  for (let start = 0; start < urls.length; start += batchSize) {
    const batch = urls.slice(start, start + batchSize);

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

async function runOha(
  urlFile: string,
  duration: string,
  connections: number,
): Promise<OhaJson> {
  const args: string[] = [
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
  ];

  const child = Bun.spawn(
    args,

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

function aggregate(results: HttpCaseResultRow[]): HttpCaseAggregateRow[] {
  const groups = new Map<string, HttpCaseResultRow[]>();

  for (const result of results) {
    const key = `${result.framework}:${result.case}`;

    let group = groups.get(key);

    if (!group) {
      group = [];

      groups.set(key, group);
    }

    group.push(result);
  }

  const rows: HttpCaseAggregateRow[] = [];

  for (const group of groups.values()) {
    const first = group[0];

    if (!first) {
      continue;
    }

    const rates = group.map((result) => result.requestsPerSecond);

    rows.push({
      framework: first.framework,

      case: first.case,

      requestsMedian: median(rates),

      requestsMin: Math.min(...rates),

      requestsMax: Math.max(...rates),

      requestsCv: coefficientOfVariation(rates),

      p50: median(group.map((result) => result.p50)),

      p95: median(group.map((result) => result.p95)),

      p99: median(group.map((result) => result.p99)),

      successRate: median(group.map((result) => result.successRate)),
    });
  }

  return rows;
}

function printGelisComparisons(rows: HttpCaseAggregateRow[]): void {
  const byCase = new Map<string, Map<string, HttpCaseAggregateRow>>();

  for (const row of rows) {
    let group = byCase.get(row.case);

    if (!group) {
      group = new Map();

      byCase.set(row.case, group);
    }

    group.set(row.framework, row);
  }

  const comparisons: Array<Record<string, string | number>> = [];

  for (const [caseName, group] of byCase) {
    const gelis = group.get("gelis");

    if (!gelis) {
      continue;
    }

    for (const competitor of ["hono", "elysia", "elysia-precompile"]) {
      const other = group.get(competitor);

      if (!other) {
        continue;
      }

      const advantage = (gelis.requestsMedian / other.requestsMedian - 1) * 100;

      comparisons.push({
        case: caseName,

        competitor,

        "Gelis req/s": formatInteger(gelis.requestsMedian),

        "competitor req/s": formatInteger(other.requestsMedian),

        "Gelis advantage %": round(advantage, 2),
      });
    }
  }

  console.log("\nGelis throughput comparison\n");

  console.table(comparisons);
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

function coefficientOfVariation(values: number[]): number {
  const average =
    values.reduce(
      (total, value) => total + value,

      0,
    ) / values.length;

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
  const metric = result.metrics?.latency_ms?.[percentile];

  if (typeof metric === "number") {
    return metric;
  }

  const legacy = result.latencyPercentiles?.[percentile];

  if (typeof legacy === "number") {
    return legacy * 1000;
  }

  throw new Error(`Unable to read ${percentile}`);
}

async function ensureOha(): Promise<void> {
  const child = Bun.spawn(
    ["oha", "--version"],

    {
      stdout: "ignore",

      stderr: "ignore",
    },
  );

  if ((await child.exited) !== 0) {
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

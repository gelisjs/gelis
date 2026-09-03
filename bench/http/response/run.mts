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

const CONNECTIONS = 50;

const SAMPLES = 7;

const WARMUP_CONNECTIONS = 10;

const WARMUP_DURATION = "2s";

const DURATION = "10s";

const PREWARM_BATCH_SIZE = 100;

const variants = [
  {
    name: "control",

    file: resolve(HERE, "servers/control.ts"),
  },

  {
    name: "managed",

    file: resolve(HERE, "servers/managed.ts"),
  },
] as const;

const cases = [
  "raw-bypass",
  "json",
  "text",
  "validate-auto",
  "validate-json",
  "reply-status",
] as const;

type VariantName = (typeof variants)[number]["name"];

type CaseName = (typeof cases)[number];

const CASE_FILTER = process.env.BENCH_CASE?.trim();

const selectedCases: readonly CaseName[] =
  CASE_FILTER === undefined || CASE_FILTER.length === 0
    ? cases
    : cases.filter((benchmarkCase) => benchmarkCase === CASE_FILTER);

if (selectedCases.length === 0) {
  throw new Error(`Unknown response benchmark case: ${CASE_FILTER}`);
}

type PairOrder = "control-first" | "managed-first";

interface RawResult {
  readonly variant: VariantName;

  readonly case: CaseName;

  readonly sample: number;

  readonly order: PairOrder;

  readonly requestsPerSecond: number;

  readonly p50: number;

  readonly p95: number;

  readonly p99: number;

  readonly successRate: number;
}

interface AggregateRow {
  readonly case: CaseName;

  readonly controlMedian: number;

  readonly managedMedian: number;

  readonly pairedDelta: number;

  readonly pairedDeltaPercent: number;

  readonly managedWins: number;

  readonly controlCv: number;

  readonly managedCv: number;

  readonly controlFirstDeltaPercent: number;

  readonly managedFirstDeltaPercent: number;

  readonly controlP50: number;

  readonly managedP50: number;

  readonly controlP95: number;

  readonly managedP95: number;

  readonly controlP99: number;

  readonly managedP99: number;
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

await ensureOha();

const urlSet = generateUrls();

const rawResults: RawResult[] = [];

for (let caseIndex = 0; caseIndex < selectedCases.length; caseIndex++) {
  const benchmarkCase = selectedCases[caseIndex];

  if (benchmarkCase === undefined) {
    continue;
  }

  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = rotate(
      variants,

      sample + caseIndex,
    );

    const pairOrder: PairOrder =
      order[0]?.name === "managed" ? "managed-first" : "control-first";

    for (const variant of order) {
      const result = await runVariant(
        variant,
        benchmarkCase,
        sample,
        pairOrder,
        urlSet,
      );

      rawResults.push(result);

      console.log(
        [
          variant.name,

          benchmarkCase,

          `sample ${sample + 1}/${SAMPLES}`,

          pairOrder,

          `${formatInteger(result.requestsPerSecond)} req/s`,
        ].join(" | "),
      );
    }
  }
}

const rows = aggregate(rawResults);

console.log("\nGelis response contracts HTTP benchmark");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`oha:         ${await getOhaVersion()}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Routes:      ${ROUTES}`);

console.log(`Connections: ${CONNECTIONS}`);

console.log(`Samples:     ${SAMPLES}`);

console.log(`Warmup:      ${WARMUP_DURATION}`);

console.log(`Duration:    ${DURATION}\n`);

console.log("Throughput\n");

console.table(
  rows.map((row) => ({
    case: row.case,

    "control req/s": formatInteger(row.controlMedian),

    "managed req/s": formatInteger(row.managedMedian),

    "paired Δ req/s": formatSignedInteger(row.pairedDelta),

    "paired Δ %": round(row.pairedDeltaPercent, 2),

    wins: `${row.managedWins}/${SAMPLES}`,

    "control CV %": round(row.controlCv * 100, 2),

    "managed CV %": round(row.managedCv * 100, 2),
  })),
);

console.log("\nOrder-bias check\n");

console.table(
  rows.map((row) => ({
    case: row.case,

    "control-first Δ %": round(row.controlFirstDeltaPercent, 2),

    "managed-first Δ %": round(row.managedFirstDeltaPercent, 2),
  })),
);

console.log("\nLatency medians\n");

console.table(
  rows.map((row) => ({
    case: row.case,

    "control p50 ms": round(row.controlP50, 3),

    "managed p50 ms": round(row.managedP50, 3),

    "control p95 ms": round(row.controlP95, 3),

    "managed p95 ms": round(row.managedP95, 3),

    "control p99 ms": round(row.controlP99, 3),

    "managed p99 ms": round(row.managedP99, 3),
  })),
);

console.log("\nPositive throughput delta means managed was faster.");

console.log("Negative throughput delta means managed was slower.");

const output = {
  metadata: {
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
  },

  results: rows,

  raw: rawResults,
};

writeFileSync(
  resolve(
    RESULTS_DIR,

    "latest-response.json",
  ),

  `${JSON.stringify(output, null, 2)}\n`,
);

console.log("\nRaw results: bench/http/results/latest-response.json");

function generateUrls(): {
  readonly urls: string[];

  readonly file: string;

  readonly readinessUrl: string;
} {
  const urls: string[] = [];

  for (let index = 0; index < ROUTES; index++) {
    urls.push(`http://127.0.0.1:${PORT}/r/${index}`);
  }

  const file = resolve(
    GENERATED_DIR,

    "response-static.txt",
  );

  writeFileSync(
    file,

    `${urls.join("\n")}\n`,
  );

  const readinessUrl = urls[0];

  if (readinessUrl === undefined) {
    throw new Error("No response benchmark URLs generated");
  }

  return {
    urls,

    file,

    readinessUrl,
  };
}

async function runVariant(
  variant: (typeof variants)[number],

  benchmarkCase: CaseName,

  sample: number,

  order: PairOrder,

  urlSet: {
    readonly urls: string[];

    readonly file: string;

    readonly readinessUrl: string;
  },
): Promise<RawResult> {
  const server = Bun.spawn(
    [process.execPath, variant.file],

    {
      cwd: ROOT,

      env: {
        ...process.env,

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
        `${variant.name} ${benchmarkCase} success rate: ${successRate}`,
      );
    }

    return {
      variant: variant.name,

      case: benchmarkCase,

      sample,

      order,

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
    "Response benchmark server did not become ready",

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
    case "raw-bypass": {
      assertEqual(response.status, 204, "raw-bypass status");

      assertEqual(body, "", "raw-bypass body");

      assertEqual(contentType, null, "raw-bypass content-type");

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

    case "validate-auto":
    case "validate-json": {
      assertEqual(response.status, 200, `${benchmarkCase} status`);

      assertEqual(
        body,
        JSON.stringify({
          id: "user-1",

          name: "Gelis",

          normalized: true,
        }),
        `${benchmarkCase} body`,
      );

      assertEqual(
        contentType,
        "application/json;charset=utf-8",
        `${benchmarkCase} content-type`,
      );

      return;
    }

    case "reply-status": {
      assertEqual(response.status, 201, "reply-status status");

      assertEqual(
        body,
        JSON.stringify({
          id: "user-1",

          name: "Gelis",
        }),
        "reply-status body",
      );

      assertEqual(
        contentType,
        "application/json;charset=utf-8",
        "reply-status content-type",
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

  const json: unknown = JSON.parse(stdout);

  if (json === null || typeof json !== "object") {
    throw new Error("oha output must be a JSON object");
  }

  return json as OhaJson;
}

function aggregate(results: readonly RawResult[]): AggregateRow[] {
  const rows: AggregateRow[] = [];

  for (const benchmarkCase of selectedCases) {
    const group = results.filter((result) => result.case === benchmarkCase);

    const control = group.filter((result) => result.variant === "control");

    const managed = group.filter((result) => result.variant === "managed");

    if (control.length !== SAMPLES || managed.length !== SAMPLES) {
      throw new Error(`Incomplete result set for ${benchmarkCase}`);
    }

    const pairedDelta: number[] = [];

    const pairedDeltaPercent: number[] = [];

    const controlFirst: number[] = [];

    const managedFirst: number[] = [];

    let managedWins = 0;

    for (let sample = 0; sample < SAMPLES; sample++) {
      const controlSample = control.find((result) => result.sample === sample);

      const managedSample = managed.find((result) => result.sample === sample);

      if (controlSample === undefined || managedSample === undefined) {
        throw new Error(`Missing paired sample ${sample} for ${benchmarkCase}`);
      }

      const delta =
        managedSample.requestsPerSecond - controlSample.requestsPerSecond;

      const percent =
        (managedSample.requestsPerSecond / controlSample.requestsPerSecond -
          1) *
        100;

      pairedDelta.push(delta);

      pairedDeltaPercent.push(percent);

      if (managedSample.requestsPerSecond > controlSample.requestsPerSecond) {
        managedWins++;
      }

      if (controlSample.order === "control-first") {
        controlFirst.push(percent);
      } else {
        managedFirst.push(percent);
      }
    }

    const controlRates = control.map((result) => result.requestsPerSecond);

    const managedRates = managed.map((result) => result.requestsPerSecond);

    rows.push({
      case: benchmarkCase,

      controlMedian: median(controlRates),

      managedMedian: median(managedRates),

      pairedDelta: median(pairedDelta),

      pairedDeltaPercent: median(pairedDeltaPercent),

      managedWins,

      controlCv: coefficientOfVariation(controlRates),

      managedCv: coefficientOfVariation(managedRates),

      controlFirstDeltaPercent: median(controlFirst),

      managedFirstDeltaPercent: median(managedFirst),

      controlP50: median(control.map((result) => result.p50)),

      managedP50: median(managed.map((result) => result.p50)),

      controlP95: median(control.map((result) => result.p95)),

      managedP95: median(managed.map((result) => result.p95)),

      controlP99: median(control.map((result) => result.p99)),

      managedP99: median(managed.map((result) => result.p99)),
    });
  }

  return rows;
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

function rotate<T>(
  values: readonly T[],

  offset: number,
): T[] {
  const index = offset % values.length;

  return [...values.slice(index), ...values.slice(0, index)];
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute median of an empty sample set");
  }

  const sorted = [...values].sort((a, b) => a - b);

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

function assertEqual<T>(
  actual: T,

  expected: T,

  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) =>
    setTimeout(
      resolvePromise,

      milliseconds,
    ),
  );
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

function formatSignedInteger(value: number): string {
  const rounded = Math.round(value);

  if (rounded > 0) {
    return `+${rounded.toLocaleString("en-US")}`;
  }

  return rounded.toLocaleString("en-US");
}

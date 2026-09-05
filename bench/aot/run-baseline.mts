import { mkdirSync, writeFileSync } from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "baseline-worker.mts");

const RESULTS_DIR = resolve(HERE, "results");

const SIZES = [1, 100, 1000, 5000] as const;

const ROUTE_KINDS = ["static", "dynamic"] as const;

const SAMPLES = 7;

type RouteKind = (typeof ROUTE_KINDS)[number];

interface WorkerResult {
  readonly routes: number;

  readonly routeKind: RouteKind;

  readonly importMs: number;

  readonly constructMs: number;

  readonly registrationMs: number;

  readonly runtimeReadyMs: number;

  readonly firstFetchUs: number;

  readonly rssBytes: number;

  readonly heapUsedBytes: number;

  readonly heapTotalBytes: number;
}

interface SampleResult extends WorkerResult {
  readonly sample: number;

  /*
   * Parent-side measurement.
   *
   * Includes:
   * - Bun process creation
   * - worker/module execution
   * - Gelis import
   * - app construction
   * - route registration
   * - first direct fetch
   * - JSON result emission
   */
  readonly processColdMs: number;
}

interface AggregateRow {
  readonly routes: number;

  readonly routeKind: RouteKind;

  readonly processColdMs: number;

  readonly processColdCv: number;

  readonly importMs: number;

  readonly constructMs: number;

  readonly registrationMs: number;

  readonly runtimeReadyMs: number;

  readonly firstFetchUs: number;

  readonly rssMb: number;

  readonly heapUsedMb: number;
}

mkdirSync(
  RESULTS_DIR,

  {
    recursive: true,
  },
);

const raw: SampleResult[] = [];

for (const routes of SIZES) {
  for (const routeKind of ROUTE_KINDS) {
    for (let sample = 0; sample < SAMPLES; sample++) {
      const result = await runWorker(
        routes,

        routeKind,

        sample,
      );

      raw.push(result);

      console.log(
        [
          routeKind,
          `${routes} routes`,
          `sample ${sample + 1}/${SAMPLES}`,
          `cold ${round(result.processColdMs, 2)} ms`,
          `register ${round(result.registrationMs, 3)} ms`,
          `rss ${round(bytesToMb(result.rssBytes), 1)} MB`,
        ].join(" | "),
      );
    }
  }
}

const rows = aggregate(raw);

console.log("\nGelis P6-A1 baseline");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Samples:     ${SAMPLES}`);

console.log("Measurement: fresh process per sample\n");

console.table(
  rows.map((row) => ({
    kind: row.routeKind,

    routes: row.routes,

    "cold ms": round(row.processColdMs, 2),

    "cold cv %": round(
      row.processColdCv * 100,

      2,
    ),

    "import ms": round(row.importMs, 3),

    "construct ms": round(row.constructMs, 3),

    "register ms": round(row.registrationMs, 3),

    "ready ms": round(row.runtimeReadyMs, 3),

    "first fetch us": round(row.firstFetchUs, 2),

    "rss MB": round(row.rssMb, 1),

    "heap MB": round(row.heapUsedMb, 1),
  })),
);

const output = {
  metadata: {
    generatedAt: new Date().toISOString(),

    phase: "P6-A1",

    bun: Bun.version,

    cpu: cpus()[0]?.model ?? "unknown",

    samples: SAMPLES,

    sizes: SIZES,

    routeKinds: ROUTE_KINDS,

    processIsolation: true,
  },

  results: rows,

  raw,
};

const outputFile = resolve(RESULTS_DIR, "baseline-v0.1.json");

writeFileSync(
  outputFile,

  `${JSON.stringify(
    output,

    null,

    2,
  )}\n`,
);

console.log("\nRaw results: " + "bench/aot/results/baseline-v0.1.json");

async function runWorker(
  routes: number,

  routeKind: RouteKind,

  sample: number,
): Promise<SampleResult> {
  const started = performance.now();

  const child = Bun.spawn(
    [process.execPath, WORKER],

    {
      cwd: ROOT,

      env: {
        ...process.env,

        ROUTES: String(routes),

        ROUTE_KIND: routeKind,
      },

      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdout = await new Response(child.stdout).text();

  const stderr = await new Response(child.stderr).text();

  const exitCode = await child.exited;

  const processColdMs = performance.now() - started;

  if (exitCode !== 0) {
    throw new Error(
      [
        `P6 baseline worker failed`,
        `kind=${routeKind}`,
        `routes=${routes}`,
        `sample=${sample}`,
        stderr,
      ].join("\n"),
    );
  }

  const line = stdout.trim().split(/\r?\n/).at(-1);

  if (!line) {
    throw new Error("P6 baseline worker produced no result");
  }

  const parsed: unknown = JSON.parse(line);

  const result = toWorkerResult(parsed);

  return {
    ...result,

    sample,

    processColdMs,
  };
}

function toWorkerResult(value: unknown): WorkerResult {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid P6 worker result");
  }

  const result = value as Record<string, unknown>;

  const routeKind = result.routeKind;

  if (routeKind !== "static" && routeKind !== "dynamic") {
    throw new Error("Invalid route kind");
  }

  return {
    routes: numberField(result, "routes"),

    routeKind,

    importMs: numberField(result, "importMs"),

    constructMs: numberField(result, "constructMs"),

    registrationMs: numberField(result, "registrationMs"),

    runtimeReadyMs: numberField(result, "runtimeReadyMs"),

    firstFetchUs: numberField(result, "firstFetchUs"),

    rssBytes: numberField(result, "rssBytes"),

    heapUsedBytes: numberField(result, "heapUsedBytes"),

    heapTotalBytes: numberField(result, "heapTotalBytes"),
  };
}

function numberField(
  value: Record<string, unknown>,

  key: string,
): number {
  const result = value[key];

  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error(`Invalid numeric worker field: ${key}`);
  }

  return result;
}

function aggregate(results: readonly SampleResult[]): AggregateRow[] {
  const groups = new Map<string, SampleResult[]>();

  for (const result of results) {
    const key = `${result.routeKind}:${result.routes}`;

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

  for (const routeKind of ROUTE_KINDS) {
    for (const routes of SIZES) {
      const group = groups.get(`${routeKind}:${routes}`);

      if (!group || group.length === 0) {
        throw new Error(`Missing aggregate group: ${routeKind}:${routes}`);
      }

      rows.push({
        routes,

        routeKind,

        processColdMs: median(group.map((result) => result.processColdMs)),

        processColdCv: coefficientOfVariation(
          group.map((result) => result.processColdMs),
        ),

        importMs: median(group.map((result) => result.importMs)),

        constructMs: median(group.map((result) => result.constructMs)),

        registrationMs: median(group.map((result) => result.registrationMs)),

        runtimeReadyMs: median(group.map((result) => result.runtimeReadyMs)),

        firstFetchUs: median(group.map((result) => result.firstFetchUs)),

        rssMb: median(group.map((result) => bytesToMb(result.rssBytes))),

        heapUsedMb: median(
          group.map((result) => bytesToMb(result.heapUsedBytes)),
        ),
      });
    }
  }

  return rows;
}

function coefficientOfVariation(values: readonly number[]): number {
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

function mean(values: readonly number[]): number {
  return (
    values.reduce(
      (total, value) => total + value,

      0,
    ) / values.length
  );
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  const middle = Math.floor(sorted.length / 2);

  const value = sorted[middle];

  if (value === undefined) {
    throw new Error("Cannot calculate median");
  }

  return value;
}

function bytesToMb(value: number): number {
  return value / 1024 / 1024;
}

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

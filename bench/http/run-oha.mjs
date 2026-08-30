import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const RESULTS_DIR = resolve(HERE, "results");

const PORT = 3100;
const ROUTES = 5000;

const SAMPLES = 3;

const CONNECTIONS = 50;

const WARMUP_DURATION = "2s";

const DURATION = "10s";

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
  },
];

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
];

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

await ensureOha();

const rawResults = [];

for (const benchmarkCase of cases) {
  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = rotate(frameworks, sample);

    for (const framework of order) {
      const result = await runFramework(framework, benchmarkCase, sample);

      rawResults.push(result);
    }
  }
}

const rows = aggregate(rawResults);

console.log("\nGelis HTTP benchmark — oha");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`oha:         ${await getOhaVersion()}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Routes:      ${ROUTES}`);

console.log(`Connections: ${CONNECTIONS}`);

console.log(`Samples:     ${SAMPLES}\n`);

console.table(
  rows.map((row) => ({
    framework: row.framework,

    case: `${row.routeKind}-${row.bodyKind}`,

    "req/s": Math.round(row.requestsPerSecond).toLocaleString("en-US"),

    "p50 ms": round(row.p50, 3),

    "p95 ms": round(row.p95, 3),

    "p99 ms": round(row.p99, 3),

    success: `${round(row.successRate * 100, 2)}%`,
  })),
);

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

    versions: {
      hono: packageVersion("hono"),

      elysia: packageVersion("elysia"),
    },
  },

  results: rows,

  raw: rawResults,
};

writeFileSync(
  resolve(RESULTS_DIR, "latest-oha.json"),

  `${JSON.stringify(output, null, 2)}\n`,
);

console.log("\nRaw results: " + "bench/http/results/latest-oha.json");

async function runFramework(framework, benchmarkCase, sample) {
  const target =
    benchmarkCase.routeKind === "static"
      ? `/r/${ROUTES - 1}`
      : `/r/${ROUTES - 1}/target`;

  const url = `http://127.0.0.1:${PORT}${target}`;

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
    await waitForServer(url);

    await runOha(url, WARMUP_DURATION, 10);

    const result = await runOha(url, DURATION, CONNECTIONS);

    const successRate =
      result.metrics?.success_rate ?? result.summary.successRate;

    if (successRate !== 1) {
      throw new Error(`${framework.name} success rate: ` + `${successRate}`);
    }

    return {
      framework: framework.name,

      routeKind: benchmarkCase.routeKind,

      bodyKind: benchmarkCase.bodyKind,

      sample,

      requestsPerSecond:
        result.metrics?.requests_per_sec ?? result.summary.requestsPerSec,

      p50:
        result.metrics?.latency_ms?.p50 ?? result.latencyPercentiles.p50 * 1000,

      p95:
        result.metrics?.latency_ms?.p95 ?? result.latencyPercentiles.p95 * 1000,

      p99:
        result.metrics?.latency_ms?.p99 ?? result.latencyPercentiles.p99 * 1000,

      successRate,
    };
  } finally {
    server.kill();

    await server.exited;

    await sleep(100);
  }
}

async function runOha(url, duration, connections) {
  const process = Bun.spawn(
    [
      "oha",

      "--no-tui",

      "--output-format",
      "json",

      "-z",
      duration,

      "-c",
      String(connections),

      url,
    ],

    {
      cwd: ROOT,

      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdout = await new Response(process.stdout).text();

  const stderr = await new Response(process.stderr).text();

  const exitCode = await process.exited;

  if (exitCode !== 0) {
    throw new Error(`oha exited with ${exitCode}\n${stderr}`);
  }

  return JSON.parse(stdout);
}

async function waitForServer(url) {
  let lastError;

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

function aggregate(results) {
  const groups = new Map();

  for (const result of results) {
    const key = [result.framework, result.routeKind, result.bodyKind].join(":");

    let group = groups.get(key);

    if (!group) {
      group = [];

      groups.set(key, group);
    }

    group.push(result);
  }

  const rows = [];

  for (const group of groups.values()) {
    const first = group[0];

    rows.push({
      framework: first.framework,

      routeKind: first.routeKind,

      bodyKind: first.bodyKind,

      requestsPerSecond: median(
        group.map((result) => result.requestsPerSecond),
      ),

      p50: median(group.map((result) => result.p50)),

      p95: median(group.map((result) => result.p95)),

      p99: median(group.map((result) => result.p99)),

      successRate: median(group.map((result) => result.successRate)),
    });
  }

  return rows;
}

function rotate(values, offset) {
  const index = offset % values.length;

  return [...values.slice(index), ...values.slice(0, index)];
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

async function ensureOha() {
  const process = Bun.spawn(
    ["oha", "--version"],

    {
      stdout: "ignore",

      stderr: "ignore",
    },
  );

  const exitCode = await process.exited;

  if (exitCode !== 0) {
    throw new Error("oha is not installed or not in PATH");
  }
}

async function getOhaVersion() {
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

function packageVersion(name) {
  try {
    const path = resolve(ROOT, "node_modules", name, "package.json");

    return JSON.parse(readFileSync(path, "utf8")).version;
  } catch {
    return "unknown";
  }
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

function round(value, digits) {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

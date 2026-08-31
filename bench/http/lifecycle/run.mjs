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
];

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
];

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

mkdirSync(GENERATED_DIR, {
  recursive: true,
});

await ensureOha();

const rawResults = [];

for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
  const benchmarkCase = cases[caseIndex];

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

console.log(`Samples:     ${SAMPLES}\n`);

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
  resolve(RESULTS_DIR, "latest-lifecycle.json"),

  `${JSON.stringify(output, null, 2)}\n`,
);

console.log("\nRaw results: " + "bench/http/results/latest-lifecycle.json");

function generateUrls(benchmarkCase) {
  const urls = [];

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

    readinessUrl: urls[0],
  };
}

async function runFramework(framework, benchmarkCase, urlSet, sample) {
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

async function prewarmRoutes(urls) {
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

  throw new Error(
    "Server did not become ready",

    {
      cause: lastError,
    },
  );
}

async function runOha(urlFile, duration, connections) {
  const args = [
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

  return JSON.parse(stdout);
}

function aggregate(results) {
  const groups = new Map();

  for (const result of results) {
    const key = `${result.framework}:${result.case}`;

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

function printGelisComparisons(rows) {
  const byCase = new Map();

  for (const row of rows) {
    let group = byCase.get(row.case);

    if (!group) {
      group = new Map();

      byCase.set(row.case, group);
    }

    group.set(row.framework, row);
  }

  const comparisons = [];

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

function coefficientOfVariation(values) {
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

function getRequestsPerSecond(result) {
  const value =
    result.metrics?.requests_per_sec ?? result.summary?.requestsPerSec;

  if (typeof value !== "number") {
    throw new Error("Unable to read requests/sec");
  }

  return value;
}

function getSuccessRate(result) {
  const value = result.metrics?.success_rate ?? result.summary?.successRate;

  if (typeof value !== "number") {
    throw new Error("Unable to read success rate");
  }

  return value;
}

function getLatencyPercentile(result, percentile) {
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

async function ensureOha() {
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

async function getOhaVersion() {
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

function formatInteger(value) {
  return Math.round(value).toLocaleString("en-US");
}

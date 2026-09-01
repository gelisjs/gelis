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
];

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
];

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

const allRows = [];

for (let caseIndex = 0; caseIndex < selectedCases.length; caseIndex++) {
  const benchmarkCase = selectedCases[caseIndex];

  if (!benchmarkCase) {
    continue;
  }

  const urlFile = createUrlFile(benchmarkCase);

  const rows = new Map();

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

        await prewarmRoutes(benchmarkCase);

        await runOha(urlFile, Math.min(CONNECTIONS, 10), WARMUP_SECONDS);

        const result = await runOha(urlFile, CONNECTIONS, DURATION_SECONDS);

        if (result.successRate !== 1) {
          throw new Error(
            `${framework.name} | ${benchmarkCase.name}: success rate ${result.successRate}`,
          );
        }

        rows.get(framework.name).push(result);

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
};

writeFileSync(
  resolve(RESULTS_DIR, resultFile),

  `${JSON.stringify(output, null, 2)}\n`,
);

console.log(`\nRaw results: bench/http/results/${resultFile}`);

function createUrlFile(benchmarkCase) {
  const file = resolve(
    GENERATED_DIR,

    `on-error-${benchmarkCase.name}.txt`,
  );

  const query = "";

  const urls = [];

  for (let index = 0; index < ROUTES; index++) {
    urls.push(`http://127.0.0.1:${PORT}/r/${index}${query}`);
  }

  writeFileSync(
    file,

    `${urls.join("\n")}\n`,
  );

  return file;
}

function startServer(framework, benchmarkCase) {
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

async function waitUntilReady(benchmarkCase) {
  const query = "";

  const url = `http://127.0.0.1:${PORT}/r/0${query}`;

  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // server not ready
    }

    await Bun.sleep(25);
  }

  throw new Error(`Server did not become ready for ${benchmarkCase.name}`);
}

async function prewarmRoutes(benchmarkCase) {
  const query = "";

  const BATCH = 100;

  for (let start = 0; start < ROUTES; start += BATCH) {
    const requests = [];

    for (let index = start; index < Math.min(start + BATCH, ROUTES); index++) {
      requests.push(fetch(`http://127.0.0.1:${PORT}/r/${index}${query}`));
    }

    const responses = await Promise.all(requests);

    for (const response of responses) {
      if (!response.ok) {
        throw new Error(`Prewarm failed with HTTP ${response.status}`);
      }

      await response.arrayBuffer();
    }
  }
}

async function runOha(urlFile, connections, seconds) {
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

  const json = JSON.parse(stdout);

  return parseOha(json);
}

function parseOha(json) {
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

function getLatencyPercentile(json, percentile) {
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

function aggregate(framework, caseName, samples) {
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

function createComparisons(rows) {
  const comparisons = [];

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

function rotate(values, offset) {
  return [...values.slice(offset), ...values.slice(0, offset)];
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
  if (values.length < 2) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance) / mean;
}

function round(value, digits) {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function readListArgument(name) {
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

async function getOhaVersion() {
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

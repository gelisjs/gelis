import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import autocannon from "autocannon";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const RESULTS_DIR = resolve(HERE, "results");

const PORT = 3100;
const ROUTES = 5000;

const SAMPLES = 3;

const CONNECTIONS = 100;
const PIPELINING = 10;
const DURATION = 10;

interface AutocannonFramework {
  readonly name: string;
  readonly file: string;
}

interface AutocannonResultRow {
  framework: string;
  routeKind: HttpRouteCase["routeKind"];
  bodyKind: HttpRouteCase["bodyKind"];
  sample: number;
  requestsPerSecond: number;
  p50: number;
  p99: number;
  errors: number;
  non2xx: number;
}

interface AutocannonAggregateRow {
  framework: string;
  routeKind: HttpRouteCase["routeKind"];
  bodyKind: HttpRouteCase["bodyKind"];
  requestsPerSecond: number;
  p50: number;
  p99: number;
  errors: number;
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
  },
] as const satisfies readonly AutocannonFramework[];

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

const rawResults: AutocannonResultRow[] = [];

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

console.log("\nGelis HTTP benchmark");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Routes:      ${ROUTES}`);

console.log(`Connections: ${CONNECTIONS}`);

console.log(`Pipelining:  ${PIPELINING}`);

console.log(`Samples:     ${SAMPLES}\n`);

console.table(
  rows.map((row) => ({
    framework: row.framework,

    case: `${row.routeKind}-${row.bodyKind}`,

    "req/s": Math.round(row.requestsPerSecond).toLocaleString("en-US"),

    "p50 ms": row.p50,

    "p99 ms": row.p99,

    errors: row.errors,
  })),
);

const output = {
  metadata: {
    generatedAt: new Date().toISOString(),

    bun: Bun.version,

    cpu: cpus()[0]?.model ?? "unknown",

    routes: ROUTES,

    samples: SAMPLES,

    connections: CONNECTIONS,

    pipelining: PIPELINING,

    duration: DURATION,

    versions: {
      hono: packageVersion("hono"),

      elysia: packageVersion("elysia"),

      autocannon: packageVersion("autocannon"),
    },
  },

  results: rows,

  raw: rawResults,
};

writeFileSync(
  resolve(RESULTS_DIR, "latest.json"),

  `${JSON.stringify(output, null, 2)}\n`,
);

console.log("\nRaw results: " + "bench/http/results/latest.json");

async function runFramework(
  framework: AutocannonFramework,
  benchmarkCase: HttpRouteCase,
  sample: number,
): Promise<AutocannonResultRow> {
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

    await autocannon({
      url,

      connections: 20,

      pipelining: 1,

      duration: 2,
    });

    const result = await autocannon({
      url,

      connections: CONNECTIONS,

      pipelining: PIPELINING,

      duration: DURATION,
    });

    if (result.errors !== 0 || result.non2xx !== 0) {
      throw new Error(
        `${framework.name} produced ` +
          `${result.errors} errors and ` +
          `${result.non2xx} non-2xx responses`,
      );
    }

    return {
      framework: framework.name,

      routeKind: benchmarkCase.routeKind,

      bodyKind: benchmarkCase.bodyKind,

      sample,

      requestsPerSecond: result.requests.average,

      p50: result.latency.p50,

      p99: result.latency.p99,

      errors: result.errors,

      non2xx: result.non2xx,
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

function aggregate(results: AutocannonResultRow[]): AutocannonAggregateRow[] {
  const groups = new Map<string, AutocannonResultRow[]>();

  for (const result of results) {
    const key = [result.framework, result.routeKind, result.bodyKind].join(":");

    let group = groups.get(key);

    if (!group) {
      group = [];

      groups.set(key, group);
    }

    group.push(result);
  }

  const rows: AutocannonAggregateRow[] = [];

  for (const group of groups.values()) {
    const first = group[0];

    if (!first) {
      continue;
    }

    rows.push({
      framework: first.framework,

      routeKind: first.routeKind,

      bodyKind: first.bodyKind,

      requestsPerSecond: median(
        group.map((result) => result.requestsPerSecond),
      ),

      p50: median(group.map((result) => result.p50)),

      p99: median(group.map((result) => result.p99)),

      errors: group.reduce(
        (total, result) => total + result.errors,

        0,
      ),
    });
  }

  return rows;
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

import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPETITIVE_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(COMPETITIVE_ROOT, "../..");
const SERVERS = resolve(COMPETITIVE_ROOT, "core", "servers");
const AOT_ROOT = resolve(COMPETITIVE_ROOT, "elysia-v2-aot");
const AOT_BUILD = resolve(AOT_ROOT, "http-aot-build.mts");
const AOT_GENERATED = resolve(AOT_ROOT, "generated", "cp2-http");

const CANDIDATE_SHA = "979821c709e809e29018791ce0fe212cded04162";
const PREVIOUS_PRODUCTION_SHA = "8e43aad09759d60378b3fc174292850057ccfba3";
const REQUIRED_BUN_VERSION = "1.4.2";
const REQUIRED_OHA_VERSION = "1.16.0";
const REQUIRED_HONO_VERSION = "4.13.7";
const REQUIRED_ELYSIA_VERSION = "1.4.30";
const REQUIRED_ELYSIA_NEXT_VERSION = "2.0.0-beta.14";

const ROUTES = 5_000;
const SAMPLE_COUNT = 7;
const PORT = 3112;
const WARMUP_DURATION = "1s";
const WARMUP_CONNECTIONS = 10;
const MEASURE_DURATION = "5s";
const MEASURE_CONNECTIONS = 50;

type Framework =
  | "raw-bun"
  | "gelis"
  | "hono"
  | "elysia-stable"
  | "elysia-stable-precompile"
  | "elysia-next"
  | "elysia-next-aot";

type Scenario = "static-raw" | "dynamic-raw" | "static-json" | "dynamic-json";

interface HttpSampleResult {
  readonly framework: Framework;
  readonly scenario: Scenario;
  readonly sample: number;
  readonly requestsPerSecond: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly successRate: number;
}

interface PairResult {
  readonly gelis: HttpSampleResult;
  readonly competitor: HttpSampleResult;
  readonly gelisFirst: boolean;
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

const scenarios: readonly Scenario[] = [
  "static-raw",
  "dynamic-raw",
  "static-json",
  "dynamic-json",
];

const competitors: readonly Framework[] = [
  "hono",
  "elysia-stable",
  "elysia-stable-precompile",
  "elysia-next",
  "elysia-next-aot",
  "raw-bun",
];

const probeOnly = process.argv.includes("--probe-only");

await assertEnvironment(probeOnly);
await buildAotArtifacts();

console.log(
  "Competitive Performance v0.1 — CP3-W HTTP Core Crown revalidation",
);
console.log(`Bun:         ${Bun.version}`);
console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);
console.log(`Harness SHA: ${gitHead(REPO_ROOT)}`);
console.log(`Gelis src:   ${CANDIDATE_SHA}`);
console.log(`Previous:    ${PREVIOUS_PRODUCTION_SHA}`);
console.log(`Hono:        ${REQUIRED_HONO_VERSION}`);
console.log(`Elysia:      ${REQUIRED_ELYSIA_VERSION}`);
console.log(`Elysia next: ${REQUIRED_ELYSIA_NEXT_VERSION}`);
console.log(`Routes:      ${ROUTES.toLocaleString("en-US")}`);

if (probeOnly) {
  console.log("Mode:        correctness probe only (no timing)\n");
  await runCorrectnessProbe();
  console.log("\nCP3-W CORRECTNESS PROBE: PASS");
} else {
  console.log(`oha:         ${getOhaVersion()}`);
  console.log(
    `Sampling:    ${SAMPLE_COUNT} mirrored fresh-server pairs/cell, warmup ${WARMUP_DURATION}/${WARMUP_CONNECTIONS}c, measure ${MEASURE_DURATION}/${MEASURE_CONNECTIONS}c`,
  );
  console.log(
    "Ratio:       Gelis req/s / comparator req/s (>1 means Gelis faster)\n",
  );
  await runTimedMatrix();
  console.log("\nCP3-W LOCAL HTTP REVALIDATION RUN: COMPLETE");
}

async function assertEnvironment(isProbeOnly: boolean): Promise<void> {
  if (Bun.version !== REQUIRED_BUN_VERSION) {
    throw new Error(
      `CP3-W requires Bun ${REQUIRED_BUN_VERSION}, received ${Bun.version}`,
    );
  }

  assertCleanWorkingTree();
  assertProductionSourceIdentity();

  const hono = await readPackageVersion(
    resolve(COMPETITIVE_ROOT, "node_modules", "hono", "package.json"),
  );
  const elysia = await readPackageVersion(
    resolve(COMPETITIVE_ROOT, "node_modules", "elysia", "package.json"),
  );
  const elysiaNext = await readPackageVersion(
    resolve(COMPETITIVE_ROOT, "node_modules", "elysia-v2", "package.json"),
  );
  const elysiaAot = await readPackageVersion(
    resolve(AOT_ROOT, "node_modules", "elysia", "package.json"),
  );

  if (hono !== REQUIRED_HONO_VERSION) {
    throw new Error(`CP3-W Hono version mismatch: ${hono}`);
  }
  if (elysia !== REQUIRED_ELYSIA_VERSION) {
    throw new Error(`CP3-W Elysia stable version mismatch: ${elysia}`);
  }
  if (elysiaNext !== REQUIRED_ELYSIA_NEXT_VERSION) {
    throw new Error(`CP3-W Elysia next version mismatch: ${elysiaNext}`);
  }
  if (elysiaAot !== REQUIRED_ELYSIA_NEXT_VERSION) {
    throw new Error(`CP3-W Elysia AOT version mismatch: ${elysiaAot}`);
  }

  if (!isProbeOnly) {
    const ohaVersion = getOhaVersion();
    if (!ohaVersion.includes(REQUIRED_OHA_VERSION)) {
      throw new Error(
        `CP3-W requires oha ${REQUIRED_OHA_VERSION}, received ${ohaVersion}`,
      );
    }
  }
}

async function buildAotArtifacts(): Promise<void> {
  const child = Bun.spawn([process.execPath, AOT_BUILD], {
    cwd: AOT_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`CP3-W Elysia AOT build exited with ${exitCode}`);
  }
}

async function runCorrectnessProbe(): Promise<void> {
  console.log("| framework | scenario | result |");
  console.log("| --- | --- | --- |");

  const frameworks: readonly Framework[] = ["gelis", ...competitors];
  for (const framework of frameworks) {
    for (const scenario of scenarios) {
      await withServer(framework, scenario, async (url) => {
        await verifyHttpResponse(url, framework, scenario);
      });
      console.log(`| ${framework} | ${scenario} | PASS |`);
    }
  }
}

async function runTimedMatrix(): Promise<void> {
  console.log(
    "| comparator | scenario | Gelis req/s | comparator req/s | ratio | Gelis-first | comparator-first | Gelis p50/p95/p99 ms | comparator p50/p95/p99 ms |",
  );
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |");

  for (const scenario of scenarios) {
    for (const competitor of competitors) {
      const pairs: PairResult[] = [];

      for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
        const gelisFirst = sample % 2 === 0;
        const firstFramework: Framework = gelisFirst ? "gelis" : competitor;
        const secondFramework: Framework = gelisFirst ? competitor : "gelis";

        const first = await runHttpSample(firstFramework, scenario, sample);
        const second = await runHttpSample(secondFramework, scenario, sample);

        const pair: PairResult = {
          gelis: gelisFirst ? first : second,
          competitor: gelisFirst ? second : first,
          gelisFirst,
        };
        pairs.push(pair);

        console.log(
          `sample ${sample + 1}/${SAMPLE_COUNT} | ${scenario} | ${gelisFirst ? `Gelis→${competitor}` : `${competitor}→Gelis`} | Gelis ${formatRate(pair.gelis.requestsPerSecond)} req/s | ${competitor} ${formatRate(pair.competitor.requestsPerSecond)} req/s | ${formatRatio(pair.gelis.requestsPerSecond / pair.competitor.requestsPerSecond)}`,
        );
      }

      const ratios = pairs.map(
        (pair) =>
          pair.gelis.requestsPerSecond / pair.competitor.requestsPerSecond,
      );
      const gelisFirstRatios = pairs
        .filter((pair) => pair.gelisFirst)
        .map(
          (pair) =>
            pair.gelis.requestsPerSecond / pair.competitor.requestsPerSecond,
        );
      const competitorFirstRatios = pairs
        .filter((pair) => !pair.gelisFirst)
        .map(
          (pair) =>
            pair.gelis.requestsPerSecond / pair.competitor.requestsPerSecond,
        );

      console.log(
        `| ${competitor} | ${scenario} | ${formatRate(median(pairs.map((pair) => pair.gelis.requestsPerSecond)))} | ${formatRate(median(pairs.map((pair) => pair.competitor.requestsPerSecond)))} | ${formatRatio(median(ratios))} | ${formatRatio(median(gelisFirstRatios))} | ${formatRatio(median(competitorFirstRatios))} | ${formatLatency(pairs.map((pair) => pair.gelis))} | ${formatLatency(pairs.map((pair) => pair.competitor))} |`,
      );
    }
  }
}

async function runHttpSample(
  framework: Framework,
  scenario: Scenario,
  sample: number,
): Promise<HttpSampleResult> {
  return await withServer(framework, scenario, async (url) => {
    await verifyHttpResponse(url, framework, scenario);
    await runOha(url, WARMUP_DURATION, WARMUP_CONNECTIONS);

    const measured = await runOha(url, MEASURE_DURATION, MEASURE_CONNECTIONS);
    const successRate = getSuccessRate(measured);

    if (successRate !== 1) {
      throw new Error(
        `${framework}/${scenario} HTTP success rate was ${successRate}`,
      );
    }

    return {
      framework,
      scenario,
      sample,
      requestsPerSecond: getRequestsPerSecond(measured),
      p50: getLatencyPercentile(measured, "p50"),
      p95: getLatencyPercentile(measured, "p95"),
      p99: getLatencyPercentile(measured, "p99"),
      successRate,
    };
  });
}

async function withServer<T>(
  framework: Framework,
  scenario: Scenario,
  operation: (url: string) => Promise<T>,
): Promise<T> {
  const processSpec = getServerProcess(framework, scenario);
  const server = Bun.spawn(processSpec.command, {
    cwd: processSpec.cwd,
    env: processSpec.env,
    stdout: "ignore",
    stderr: "pipe",
  });

  const stderrPromise = new Response(server.stderr).text();
  const url = targetUrl(scenario);

  try {
    await waitForServer(url, server);
    return await operation(url);
  } finally {
    server.kill();
    await server.exited;
    const stderr = await stderrPromise;

    if (
      server.exitCode !== 0 &&
      server.exitCode !== null &&
      stderr.trim().length > 0
    ) {
      console.error(stderr.trim());
    }

    await sleep(100);
  }
}

function getServerProcess(
  framework: Framework,
  scenario: Scenario,
): {
  readonly command: string[];
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
} {
  const routeKind = scenario.startsWith("dynamic-") ? "dynamic" : "static";
  const bodyKind = scenario.endsWith("-raw") ? "raw" : "json";
  const env: Record<string, string | undefined> = {
    ...process.env,
    PORT: String(PORT),
    ROUTES: String(ROUTES),
    ROUTE_KIND: routeKind,
    BODY_KIND: bodyKind,
  };

  switch (framework) {
    case "raw-bun":
      return {
        command: [process.execPath, resolve(SERVERS, "raw-bun.ts")],
        cwd: COMPETITIVE_ROOT,
        env,
      };
    case "gelis":
      return {
        command: [process.execPath, resolve(SERVERS, "gelis.ts")],
        cwd: COMPETITIVE_ROOT,
        env,
      };
    case "hono":
      return {
        command: [process.execPath, resolve(SERVERS, "hono.ts")],
        cwd: COMPETITIVE_ROOT,
        env,
      };
    case "elysia-stable":
      return {
        command: [process.execPath, resolve(SERVERS, "elysia-stable.ts")],
        cwd: COMPETITIVE_ROOT,
        env: { ...env, PRECOMPILE: "false" },
      };
    case "elysia-stable-precompile":
      return {
        command: [process.execPath, resolve(SERVERS, "elysia-stable.ts")],
        cwd: COMPETITIVE_ROOT,
        env: { ...env, PRECOMPILE: "true" },
      };
    case "elysia-next":
      return {
        command: [process.execPath, resolve(SERVERS, "elysia-next.ts")],
        cwd: COMPETITIVE_ROOT,
        env,
      };
    case "elysia-next-aot": {
      const artifact = resolve(AOT_GENERATED, scenario, "server.js");
      return {
        command: [process.execPath, artifact],
        cwd: dirname(artifact),
        env,
      };
    }
  }
}

async function waitForServer(
  url: string,
  server: ReturnType<typeof Bun.spawn>,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 400; attempt++) {
    if (server.exitCode !== null) {
      throw new Error(`CP3-W server exited early with ${server.exitCode}`);
    }

    try {
      const response = await fetch(url);
      if (response.status === 200) {
        await response.body?.cancel();
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(25);
  }

  throw new Error("CP3-W server did not become ready", { cause: lastError });
}

async function verifyHttpResponse(
  url: string,
  framework: Framework,
  scenario: Scenario,
): Promise<void> {
  const response = await fetch(url);

  if (response.status !== 200) {
    throw new Error(
      `${framework}/${scenario} returned HTTP ${response.status}`,
    );
  }

  const body = await response.text();
  const expected = expectedBody(scenario);
  if (body !== expected) {
    throw new Error(
      `${framework}/${scenario} body mismatch: expected ${expected}, got ${body}`,
    );
  }

  const mediaType =
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() ?? "";
  const expectedMediaType = scenario.endsWith("-raw")
    ? "text/plain"
    : "application/json";

  if (mediaType !== expectedMediaType) {
    throw new Error(
      `${framework}/${scenario} media type mismatch: ${mediaType}`,
    );
  }

  if (response.headers.get("content-encoding") !== null) {
    throw new Error(`${framework}/${scenario} unexpectedly encoded response`);
  }
}

function expectedBody(scenario: Scenario): string {
  switch (scenario) {
    case "static-raw":
      return "GET";
    case "dynamic-raw":
      return "value-42";
    case "static-json":
      return JSON.stringify({ method: "GET", route: ROUTES - 1 });
    case "dynamic-json":
      return JSON.stringify({ method: "GET", id: "value-42" });
  }
}

function targetUrl(scenario: Scenario): string {
  const path = scenario.startsWith("static-")
    ? `/r/${ROUTES - 1}`
    : `/r/${ROUTES - 1}/value-42`;
  return `http://127.0.0.1:${PORT}${path}`;
}

async function runOha(
  url: string,
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
      "-z",
      duration,
      "-c",
      String(connections),
      url,
    ],
    {
      cwd: COMPETITIVE_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  const exitCode = await child.exited;
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(`oha exited with ${exitCode}\n${stderr}`);
  }

  const parsed: unknown = JSON.parse(stdout);
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("oha output must be a JSON object");
  }

  return parsed as OhaJson;
}

function getRequestsPerSecond(result: OhaJson): number {
  const value =
    result.metrics?.requests_per_sec ?? result.summary?.requestsPerSec;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("Unable to read oha requests/sec");
  }
  return value;
}

function getSuccessRate(result: OhaJson): number {
  const value = result.metrics?.success_rate ?? result.summary?.successRate;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Unable to read oha success rate");
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
    return legacy * 1_000;
  }

  throw new Error(`Unable to read oha ${percentile}`);
}

async function readPackageVersion(path: string): Promise<string> {
  const value: unknown = await Bun.file(path).json();
  if (
    value === null ||
    typeof value !== "object" ||
    !("version" in value) ||
    typeof value.version !== "string"
  ) {
    throw new Error(`Invalid package.json at ${path}`);
  }
  return value.version;
}

function getOhaVersion(): string {
  const result = Bun.spawnSync(["oha", "--version"], {
    cwd: COMPETITIVE_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }

  return [
    new TextDecoder().decode(result.stdout),
    new TextDecoder().decode(result.stderr),
  ]
    .join(" ")
    .trim();
}

function assertCleanWorkingTree(): void {
  const result = Bun.spawnSync(["git", "status", "--porcelain"], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }

  const status = new TextDecoder().decode(result.stdout).trim();
  if (status.length !== 0) {
    throw new Error(`CP3-W worktree must be clean:\n${status}`);
  }
}

function assertProductionSourceIdentity(): void {
  const result = Bun.spawnSync(
    [
      "git",
      "diff",
      "--quiet",
      CANDIDATE_SHA,
      "--",
      "src",
      "test/runtime/url.test.ts",
    ],
    { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" },
  );

  if (result.exitCode === 0) {
    return;
  }
  if (result.exitCode === 1) {
    throw new Error(
      `CP3-W src/** differs from accepted CP3-J source ${CANDIDATE_SHA}`,
    );
  }
  throw new Error(new TextDecoder().decode(result.stderr));
}

function gitHead(root: string): string {
  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }
  return new TextDecoder().decode(result.stdout).trim();
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute median of empty CP3-W set");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[midpoint]!
    : (sorted[midpoint - 1]! + sorted[midpoint]!) / 2;
}

function formatLatency(samples: readonly HttpSampleResult[]): string {
  return `${median(samples.map((sample) => sample.p50)).toFixed(3)}/${median(samples.map((sample) => sample.p95)).toFixed(3)}/${median(samples.map((sample) => sample.p99)).toFixed(3)}`;
}

function formatRate(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatRatio(value: number): string {
  return `${value.toFixed(4)}x`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

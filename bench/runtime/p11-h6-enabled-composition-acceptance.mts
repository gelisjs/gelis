import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const WORKER = resolve(HERE, "p11-h6-enabled-composition-worker.mts");
const HTTP_SERVER = resolve(HERE, "p11-h6-http-server.mts");

const CANDIDATE_SHA = "1dd5f94cf0e9ad884ca44e537ee287587cd8baab";
const HONO_VERSION = "4.13.5";
const OHA_VERSION = "1.16.0";

const DIRECT_SAMPLE_COUNT = 11;
const DIRECT_CASE_GATE = 1.15;
const DIRECT_GEOMEAN_GATE = 1.1;

const HTTP_SAMPLE_COUNT = 7;
const HTTP_CONNECTIONS = 50;
const HTTP_WARMUP_CONNECTIONS = 10;
const HTTP_WARMUP_DURATION = "2s";
const HTTP_DURATION = "10s";
const HTTP_GATE = 0.9;
const HTTP_PORT = 3106;

const ROUTE_SCALE_SAMPLE_COUNT = 11;
const ROUTE_SCALE_GATE = 1.5;

const ORIGIN = "https://client.test";
const FIXED_REQUEST_ID = "req_p11_h6_fixed";

type Framework = "gelis" | "hono";
type DirectScenario = "actual-cors-static-204" | "actual-cors-static-json";

interface DirectWorkerResult {
  readonly mode: "direct";
  readonly framework: Framework;
  readonly scenario: DirectScenario;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
}

interface RouteScaleWorkerResult {
  readonly mode: "route-scale";
  readonly routes: 1_000 | 5_000;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
}

type WorkerResult = DirectWorkerResult | RouteScaleWorkerResult;

interface PairedResult {
  readonly gelisNs: number;
  readonly honoNs: number;
  readonly ratio: number;
  readonly honoFirstRatio: number;
  readonly gelisFirstRatio: number;
}

interface RouteScalePairedResult {
  readonly thousandNs: number;
  readonly fiveThousandNs: number;
  readonly ratio: number;
  readonly thousandFirstRatio: number;
  readonly fiveThousandFirstRatio: number;
}

interface HttpSampleResult {
  readonly framework: Framework;
  readonly sample: number;
  readonly requestsPerSecond: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly successRate: number;
}

interface HttpPairResult {
  readonly gelis: HttpSampleResult;
  readonly hono: HttpSampleResult;
  readonly honoFirst: boolean;
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

const options = readOptions(process.argv.slice(2));
const candidateRoot = resolve(ROOT, options.candidateRoot);
const candidateSha = gitHead(candidateRoot);

if (candidateSha !== CANDIDATE_SHA) {
  throw new Error(
    `P11-H6 candidate must be ${CANDIDATE_SHA}, received ${candidateSha}`,
  );
}

assertCleanWorkingTree(candidateRoot);

if (Bun.version !== "1.4.0") {
  throw new Error(`P11-H6 requires Bun 1.4.0, received ${Bun.version}`);
}

const honoVersion = await readHonoVersion();
if (honoVersion !== HONO_VERSION) {
  throw new Error(
    `P11-H6 requires Hono ${HONO_VERSION}, received ${honoVersion}`,
  );
}

await ensureOha();
const ohaVersion = await getOhaVersion();
if (!ohaVersion.includes(OHA_VERSION)) {
  throw new Error(`P11-H6 requires oha ${OHA_VERSION}, received ${ohaVersion}`);
}

console.log("P11-H6 Representative Enabled Composition Performance Acceptance");
console.log(`Bun:       ${Bun.version}`);
console.log(`CPU:       ${cpus()[0]?.model ?? "unknown"}`);
console.log(`Candidate: ${candidateSha}`);
console.log(`Hono:      ${honoVersion}`);
console.log(`oha:       ${ohaVersion}`);
console.log(
  `Direct:    ${DIRECT_SAMPLE_COUNT} mirrored fresh-process pairs per case`,
);
console.log(
  `HTTP:      ${HTTP_SAMPLE_COUNT} alternating pairs, ${HTTP_CONNECTIONS} connections`,
);
console.log(
  `Scale:     ${ROUTE_SCALE_SAMPLE_COUNT} mirrored fresh-process 5000/1000 pairs\n`,
);

let accepted = true;
const directScenarios: readonly DirectScenario[] = [
  "actual-cors-static-204",
  "actual-cors-static-json",
];

console.log("Enabled composition direct comparison vs Hono 4.13.5");
console.log(
  "| scenario | Gelis ns/op | Hono ns/op | Gelis/Hono | Hono-first | Gelis-first | gate |",
);
console.log("| --- | ---: | ---: | ---: | ---: | ---: | --- |");

const directRatios: number[] = [];

for (const scenario of directScenarios) {
  const result = await runMirroredFrameworks(scenario, candidateRoot);
  const pass = result.ratio <= DIRECT_CASE_GATE;

  directRatios.push(result.ratio);
  accepted &&= pass;

  console.log(
    `| ${scenario} | ${formatNs(result.gelisNs)} | ${formatNs(result.honoNs)} | ${formatRatio(result.ratio)} | ${formatRatio(result.honoFirstRatio)} | ${formatRatio(result.gelisFirstRatio)} | ${pass ? "PASS" : "FAIL"} |`,
  );
}

const directGeomean = geometricMean(directRatios);
const directGeomeanPass = directGeomean <= DIRECT_GEOMEAN_GATE;
accepted &&= directGeomeanPass;

console.log(
  `\nEnabled direct geomean: ${formatRatio(directGeomean)} <= ${DIRECT_GEOMEAN_GATE.toFixed(2)}x => ${directGeomeanPass ? "PASS" : "FAIL"}\n`,
);

console.log("HTTP enabled static-204 comparison");
const httpPairs: HttpPairResult[] = [];

for (let sample = 0; sample < HTTP_SAMPLE_COUNT; sample++) {
  const honoFirst = sample % 2 === 0;
  const firstFramework: Framework = honoFirst ? "hono" : "gelis";
  const secondFramework: Framework = honoFirst ? "gelis" : "hono";

  const first = await runHttpFramework(firstFramework, candidateRoot, sample);
  const second = await runHttpFramework(secondFramework, candidateRoot, sample);

  const pair: HttpPairResult = {
    gelis: honoFirst ? second : first,
    hono: honoFirst ? first : second,
    honoFirst,
  };
  httpPairs.push(pair);

  console.log(
    `sample ${sample + 1}/${HTTP_SAMPLE_COUNT} | ${honoFirst ? "Hono→Gelis" : "Gelis→Hono"} | Gelis ${formatRate(pair.gelis.requestsPerSecond)} req/s | Hono ${formatRate(pair.hono.requestsPerSecond)} req/s | ${formatRatio(pair.gelis.requestsPerSecond / pair.hono.requestsPerSecond)}`,
  );
}

const gelisHttpMedian = median(
  httpPairs.map((pair) => pair.gelis.requestsPerSecond),
);
const honoHttpMedian = median(
  httpPairs.map((pair) => pair.hono.requestsPerSecond),
);
const httpMedianRatio = gelisHttpMedian / honoHttpMedian;
const httpPairwiseRatio = median(
  httpPairs.map(
    (pair) => pair.gelis.requestsPerSecond / pair.hono.requestsPerSecond,
  ),
);
const httpHonoFirstRatio = median(
  httpPairs
    .filter((pair) => pair.honoFirst)
    .map((pair) => pair.gelis.requestsPerSecond / pair.hono.requestsPerSecond),
);
const httpGelisFirstRatio = median(
  httpPairs
    .filter((pair) => !pair.honoFirst)
    .map((pair) => pair.gelis.requestsPerSecond / pair.hono.requestsPerSecond),
);
const httpPass = httpMedianRatio >= HTTP_GATE;
accepted &&= httpPass;

console.log("\nHTTP summary");
console.log(`Gelis median:        ${formatRate(gelisHttpMedian)} req/s`);
console.log(`Hono median:         ${formatRate(honoHttpMedian)} req/s`);
console.log(`Median throughput:   ${formatRatio(httpMedianRatio)}`);
console.log(`Pairwise diagnostic: ${formatRatio(httpPairwiseRatio)}`);
console.log(
  `Order diagnostics: Hono-first ${formatRatio(httpHonoFirstRatio)}, Gelis-first ${formatRatio(httpGelisFirstRatio)}`,
);
console.log(
  `Latency diagnostics: Gelis p50/p95/p99 ${formatMs(median(httpPairs.map((pair) => pair.gelis.p50)))}/${formatMs(median(httpPairs.map((pair) => pair.gelis.p95)))}/${formatMs(median(httpPairs.map((pair) => pair.gelis.p99)))} ms`,
);
console.log(
  `                     Hono  p50/p95/p99 ${formatMs(median(httpPairs.map((pair) => pair.hono.p50)))}/${formatMs(median(httpPairs.map((pair) => pair.hono.p95)))}/${formatMs(median(httpPairs.map((pair) => pair.hono.p99)))} ms`,
);
console.log(
  `HTTP gate: ${formatRatio(httpMedianRatio)} >= ${HTTP_GATE.toFixed(2)}x => ${httpPass ? "PASS" : "FAIL"}\n`,
);

console.log("Combined managed JSON + bodyLimit + timeout route-scale");
const routeScale = await runMirroredRouteScale(candidateRoot);
const routeScalePass = routeScale.ratio <= ROUTE_SCALE_GATE;
accepted &&= routeScalePass;

console.log(`1,000 routes median: ${formatNs(routeScale.thousandNs)} ns/op`);
console.log(
  `5,000 routes median: ${formatNs(routeScale.fiveThousandNs)} ns/op`,
);
console.log(`5000/1000 median:    ${formatRatio(routeScale.ratio)}`);
console.log(
  `Order diagnostics:  1000-first ${formatRatio(routeScale.thousandFirstRatio)}, 5000-first ${formatRatio(routeScale.fiveThousandFirstRatio)}`,
);
console.log(
  `Route-scale gate: ${formatRatio(routeScale.ratio)} <= ${ROUTE_SCALE_GATE.toFixed(2)}x => ${routeScalePass ? "PASS" : "FAIL"}`,
);

console.log(`\nP11-H6 ACCEPTANCE: ${accepted ? "PASS" : "FAIL"}`);

if (!accepted) {
  process.exitCode = 1;
}

async function runMirroredFrameworks(
  scenario: DirectScenario,
  candidate: string,
): Promise<PairedResult> {
  const pairs: Array<{
    gelis: DirectWorkerResult;
    hono: DirectWorkerResult;
    honoFirst: boolean;
  }> = [];

  for (let sample = 0; sample < DIRECT_SAMPLE_COUNT; sample++) {
    const honoFirst = sample % 2 === 0;
    const firstFramework: Framework = honoFirst ? "hono" : "gelis";
    const secondFramework: Framework = honoFirst ? "gelis" : "hono";

    const first = await runDirectWorker(firstFramework, scenario, candidate);
    const second = await runDirectWorker(secondFramework, scenario, candidate);

    pairs.push({
      gelis: honoFirst ? second : first,
      hono: honoFirst ? first : second,
      honoFirst,
    });
  }

  const ratios = pairs.map((pair) => pair.gelis.nsPerOp / pair.hono.nsPerOp);
  const honoFirstRatios = pairs
    .filter((pair) => pair.honoFirst)
    .map((pair) => pair.gelis.nsPerOp / pair.hono.nsPerOp);
  const gelisFirstRatios = pairs
    .filter((pair) => !pair.honoFirst)
    .map((pair) => pair.gelis.nsPerOp / pair.hono.nsPerOp);

  return {
    gelisNs: median(pairs.map((pair) => pair.gelis.nsPerOp)),
    honoNs: median(pairs.map((pair) => pair.hono.nsPerOp)),
    ratio: median(ratios),
    honoFirstRatio: median(honoFirstRatios),
    gelisFirstRatio: median(gelisFirstRatios),
  };
}

async function runMirroredRouteScale(
  candidate: string,
): Promise<RouteScalePairedResult> {
  const pairs: Array<{
    thousand: RouteScaleWorkerResult;
    fiveThousand: RouteScaleWorkerResult;
    thousandFirst: boolean;
  }> = [];

  for (let sample = 0; sample < ROUTE_SCALE_SAMPLE_COUNT; sample++) {
    const thousandFirst = sample % 2 === 0;
    const firstSize = thousandFirst ? 1_000 : 5_000;
    const secondSize = thousandFirst ? 5_000 : 1_000;
    const first = await runRouteScaleWorker(firstSize, candidate);
    const second = await runRouteScaleWorker(secondSize, candidate);

    pairs.push({
      thousand: thousandFirst ? first : second,
      fiveThousand: thousandFirst ? second : first,
      thousandFirst,
    });
  }

  const ratios = pairs.map(
    (pair) => pair.fiveThousand.nsPerOp / pair.thousand.nsPerOp,
  );
  const thousandFirstRatios = pairs
    .filter((pair) => pair.thousandFirst)
    .map((pair) => pair.fiveThousand.nsPerOp / pair.thousand.nsPerOp);
  const fiveThousandFirstRatios = pairs
    .filter((pair) => !pair.thousandFirst)
    .map((pair) => pair.fiveThousand.nsPerOp / pair.thousand.nsPerOp);

  return {
    thousandNs: median(pairs.map((pair) => pair.thousand.nsPerOp)),
    fiveThousandNs: median(pairs.map((pair) => pair.fiveThousand.nsPerOp)),
    ratio: median(ratios),
    thousandFirstRatio: median(thousandFirstRatios),
    fiveThousandFirstRatio: median(fiveThousandFirstRatios),
  };
}

async function runDirectWorker(
  framework: Framework,
  scenario: DirectScenario,
  candidate: string,
): Promise<DirectWorkerResult> {
  const result = await runWorker([
    "--mode=direct",
    `--framework=${framework}`,
    `--scenario=${scenario}`,
    `--candidate-root=${candidate}`,
  ]);

  if (result.mode !== "direct") {
    throw new Error("P11-H6 direct worker returned wrong mode");
  }

  return result;
}

async function runRouteScaleWorker(
  routes: 1_000 | 5_000,
  candidate: string,
): Promise<RouteScaleWorkerResult> {
  const result = await runWorker([
    "--mode=route-scale",
    `--routes=${routes}`,
    `--candidate-root=${candidate}`,
  ]);

  if (result.mode !== "route-scale") {
    throw new Error("P11-H6 route-scale worker returned wrong mode");
  }

  return result;
}

async function runWorker(args: readonly string[]): Promise<WorkerResult> {
  const child = Bun.spawn([process.execPath, WORKER, ...args], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  const exitCode = await child.exited;
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      ["P11-H6 benchmark worker failed", ...args, stdout, stderr].join("\n"),
    );
  }

  const lines = stdout
    .trim()
    .split(/\r?\n/u)
    .filter((line) => line.length > 0);
  const last = lines.at(-1);

  if (last === undefined) {
    throw new Error("P11-H6 worker emitted no JSON");
  }

  const parsed: unknown = JSON.parse(last);
  if (!isWorkerResult(parsed)) {
    throw new Error(`Invalid P11-H6 worker result: ${last}`);
  }

  return parsed;
}

function isWorkerResult(value: unknown): value is WorkerResult {
  if (value === null || typeof value !== "object" || !("mode" in value)) {
    return false;
  }

  if (value.mode === "direct") {
    return (
      "framework" in value &&
      (value.framework === "gelis" || value.framework === "hono") &&
      "scenario" in value &&
      typeof value.scenario === "string" &&
      "iterations" in value &&
      typeof value.iterations === "number" &&
      value.iterations > 0 &&
      "warmups" in value &&
      typeof value.warmups === "number" &&
      value.warmups > 0 &&
      "nsPerOp" in value &&
      typeof value.nsPerOp === "number" &&
      Number.isFinite(value.nsPerOp) &&
      value.nsPerOp > 0 &&
      "sink" in value &&
      typeof value.sink === "number"
    );
  }

  if (value.mode === "route-scale") {
    return (
      "routes" in value &&
      (value.routes === 1_000 || value.routes === 5_000) &&
      "iterations" in value &&
      typeof value.iterations === "number" &&
      value.iterations > 0 &&
      "warmups" in value &&
      typeof value.warmups === "number" &&
      value.warmups > 0 &&
      "nsPerOp" in value &&
      typeof value.nsPerOp === "number" &&
      Number.isFinite(value.nsPerOp) &&
      value.nsPerOp > 0 &&
      "sink" in value &&
      typeof value.sink === "number"
    );
  }

  return false;
}

async function runHttpFramework(
  framework: Framework,
  candidate: string,
  sample: number,
): Promise<HttpSampleResult> {
  const server = Bun.spawn([process.execPath, HTTP_SERVER], {
    cwd: ROOT,
    env: {
      ...process.env,
      FRAMEWORK: framework,
      CANDIDATE_ROOT: candidate,
      PORT: String(HTTP_PORT),
    },
    stdout: "ignore",
    stderr: "pipe",
  });

  const stderrPromise = new Response(server.stderr).text();
  const url = `http://127.0.0.1:${HTTP_PORT}/resource`;

  try {
    await waitForServer(url, server);
    await verifyHttpResponse(url, framework);
    await runOha(url, HTTP_WARMUP_DURATION, HTTP_WARMUP_CONNECTIONS);

    const measured = await runOha(url, HTTP_DURATION, HTTP_CONNECTIONS);
    const successRate = getSuccessRate(measured);

    if (successRate !== 1) {
      throw new Error(`${framework} HTTP success rate: ${successRate}`);
    }

    return {
      framework,
      sample,
      requestsPerSecond: getRequestsPerSecond(measured),
      p50: getLatencyPercentile(measured, "p50"),
      p95: getLatencyPercentile(measured, "p95"),
      p99: getLatencyPercentile(measured, "p99"),
      successRate,
    };
  } finally {
    server.kill();
    await server.exited;
    const stderr = await stderrPromise;

    if (
      server.exitCode !== 0 &&
      server.exitCode !== null &&
      stderr.trim() !== ""
    ) {
      console.error(stderr.trim());
    }

    await sleep(100);
  }
}

async function verifyHttpResponse(
  url: string,
  framework: Framework,
): Promise<void> {
  const response = await fetch(url, {
    headers: { Origin: ORIGIN },
  });

  if (response.status !== 204) {
    throw new Error(
      `${framework} HTTP verification returned ${response.status}`,
    );
  }

  if (response.headers.get("access-control-allow-origin") !== ORIGIN) {
    throw new Error(`${framework} HTTP CORS origin mismatch`);
  }

  assertVaryOrigin(framework, response.headers.get("vary"));
  assertSecurityHeaders(framework, response.headers);

  if (response.headers.get("x-request-id") !== FIXED_REQUEST_ID) {
    throw new Error(`${framework} HTTP request-ID mismatch`);
  }
}

async function waitForServer(
  url: string,
  server: ReturnType<typeof Bun.spawn>,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) {
      throw new Error(`Benchmark server exited early with ${server.exitCode}`);
    }

    try {
      const response = await fetch(url, {
        headers: { Origin: ORIGIN },
      });
      if (response.status === 204) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(25);
  }

  throw new Error("P11-H6 HTTP server did not become ready", {
    cause: lastError,
  });
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
      "-H",
      `Origin: ${ORIGIN}`,
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

function assertSecurityHeaders(framework: string, headers: Headers): void {
  const expected = new Map<string, string>([
    ["strict-transport-security", "max-age=31536000"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "no-referrer"],
    ["x-frame-options", "SAMEORIGIN"],
    ["x-xss-protection", "0"],
  ]);

  const names = [
    "strict-transport-security",
    "x-content-type-options",
    "referrer-policy",
    "x-frame-options",
    "x-xss-protection",
    "x-powered-by",
    "content-security-policy",
    "content-security-policy-report-only",
    "cross-origin-embedder-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "origin-agent-cluster",
    "permissions-policy",
    "x-dns-prefetch-control",
    "x-download-options",
    "x-permitted-cross-domain-policies",
  ] as const;

  for (const name of names) {
    const actual = headers.get(name);
    const expectedValue = expected.get(name);

    if (expectedValue === undefined) {
      if (actual !== null) {
        throw new Error(`${framework} emitted unexpected ${name}: ${actual}`);
      }
    } else if (actual !== expectedValue) {
      throw new Error(
        `${framework} ${name} mismatch: ${String(actual)} !== ${expectedValue}`,
      );
    }
  }
}

function assertVaryOrigin(framework: string, vary: string | null): void {
  if (vary === null) {
    throw new Error(`${framework} missing Vary: Origin`);
  }

  const fields = vary
    .split(",")
    .map((field) => field.trim().toLowerCase())
    .filter((field) => field.length > 0);

  if (!fields.includes("origin")) {
    throw new Error(`${framework} Vary did not include Origin: ${vary}`);
  }
}

interface Options {
  readonly candidateRoot: string;
}

function readOptions(values: readonly string[]): Options {
  let candidateRoot: string | undefined;

  for (const value of values) {
    if (value.startsWith("--candidate-root=")) {
      candidateRoot = value.slice("--candidate-root=".length);
    }
  }

  if (candidateRoot === undefined || candidateRoot.length === 0) {
    throw new Error("P11-H6 benchmark requires --candidate-root=<path>");
  }

  return { candidateRoot };
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

function assertCleanWorkingTree(root: string): void {
  const result = Bun.spawnSync(["git", "status", "--porcelain"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }

  const status = new TextDecoder().decode(result.stdout).trim();
  if (status.length !== 0) {
    throw new Error(`P11-H6 candidate worktree must be clean:\n${status}`);
  }
}

async function readHonoVersion(): Promise<string> {
  const file = Bun.file(resolve(ROOT, "node_modules/hono/package.json"));
  const json = (await file.json()) as { readonly version?: unknown };

  return typeof json.version === "string" ? json.version : "unknown";
}

async function ensureOha(): Promise<void> {
  const child = Bun.spawn(["oha", "--version"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  const exitCode = await child.exited;

  if (exitCode !== 0) {
    throw new Error("oha is not installed or not in PATH");
  }
}

async function getOhaVersion(): Promise<string> {
  const child = Bun.spawn(["oha", "--version"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = await new Response(child.stdout).text();
  await child.exited;

  return output.trim();
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute median of empty P11-H6 sample set");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[midpoint]!
    : (sorted[midpoint - 1]! + sorted[midpoint]!) / 2;
}

function geometricMean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute geometric mean of empty P11-H6 set");
  }

  return Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) / values.length,
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

function formatNs(value: number): string {
  return value.toFixed(1);
}

function formatRate(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatRatio(value: number): string {
  return `${value.toFixed(4)}x`;
}

function formatMs(value: number): string {
  return value.toFixed(3);
}

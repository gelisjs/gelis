import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const PACKAGE_ROOT = resolve(HERE, "..");
const WORKER = resolve(HERE, "direct-worker.mts");

const GELIS_SOURCE_SHA = "1dd5f94cf0e9ad884ca44e537ee287587cd8baab";
const REQUIRED_BUN = "1.4.2";
const REQUIRED_HONO = "4.13.7";
const REQUIRED_ELYSIA = "1.4.30";
const REQUIRED_ELYSIA_NEXT = "2.0.0-beta.14";
const SAMPLE_COUNT = 11;

const frameworks = [
  "hono",
  "elysia-stable",
  "elysia-stable-precompile",
  "elysia-next",
] as const;
const allFrameworks = ["gelis", ...frameworks] as const;
const scenarios = [
  "static-raw",
  "dynamic-raw",
  "static-json",
  "dynamic-json",
] as const;
const routeCounts = [1, 100, 1_000, 5_000] as const;

type Framework = (typeof allFrameworks)[number];
type Competitor = (typeof frameworks)[number];
type Scenario = (typeof scenarios)[number];
type CompletionMode = "sync" | "async";

interface TimedWorkerResult {
  readonly kind: "timed";
  readonly framework: Framework;
  readonly scenario: Scenario;
  readonly routes: number;
  readonly completion: CompletionMode;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
}

interface ProbeWorkerResult {
  readonly kind: "probe";
  readonly framework: Framework;
  readonly scenario: Scenario;
  readonly routes: number;
  readonly completion: CompletionMode;
}

type WorkerResult = TimedWorkerResult | ProbeWorkerResult;

interface PairSummary {
  readonly gelisNs: number;
  readonly competitorNs: number;
  readonly ratio: number;
  readonly gelisFirstRatio: number;
  readonly competitorFirstRatio: number;
  readonly gelisCompletion: CompletionMode;
  readonly competitorCompletion: CompletionMode;
}

const probeOnly = process.argv.includes("--probe-only");

assertEnvironment();

console.log("Competitive Performance v0.1 — CP2-D direct dispatch crown");
console.log(`Bun:         ${Bun.version}`);
console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);
console.log(`Harness SHA: ${gitHead(ROOT)}`);
console.log(`Gelis src:   ${GELIS_SOURCE_SHA}`);
console.log(`Hono:        ${REQUIRED_HONO}`);
console.log(`Elysia:      ${REQUIRED_ELYSIA}`);
console.log(`Elysia next: ${REQUIRED_ELYSIA_NEXT}`);

if (probeOnly) {
  await runProbeOnly();
  process.exit(0);
}

console.log(`Samples:     ${SAMPLE_COUNT} mirrored fresh-process pairs/cell`);
console.log("Ratio:       competitor ns/op / Gelis ns/op (>1 means Gelis faster)\n");
console.log(
  "| competitor | routes | scenario | Gelis ns/op | competitor ns/op | ratio | Gelis-first | competitor-first | completion |",
);
console.log(
  "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |",
);

for (const routes of routeCounts) {
  for (const scenario of scenarios) {
    for (const competitor of frameworks) {
      const summary = await runMirrored(competitor, scenario, routes);
      console.log(
        `| ${competitor} | ${routes} | ${scenario} | ${formatNs(summary.gelisNs)} | ${formatNs(summary.competitorNs)} | ${formatRatio(summary.ratio)} | ${formatRatio(summary.gelisFirstRatio)} | ${formatRatio(summary.competitorFirstRatio)} | ${summary.gelisCompletion}/${summary.competitorCompletion} |`,
      );
    }
  }
}

console.log("\nCP2-D LOCAL CROWN RUN: COMPLETE");

async function runProbeOnly(): Promise<void> {
  console.log("Mode:        correctness probe only (no timing)\n");
  console.log("| framework | scenario | completion | result |");
  console.log("| --- | --- | --- | --- |");

  for (const framework of allFrameworks) {
    for (const scenario of scenarios) {
      const result = await runWorker(framework, scenario, 3, true);
      if (result.kind !== "probe") {
        throw new Error("Probe-only worker unexpectedly emitted timed output");
      }
      console.log(
        `| ${framework} | ${scenario} | ${result.completion} | PASS |`,
      );
    }
  }

  console.log("\nCP2-D PROBE: PASS");
}

async function runMirrored(
  competitor: Competitor,
  scenario: Scenario,
  routes: number,
): Promise<PairSummary> {
  const pairs: Array<{
    readonly gelis: TimedWorkerResult;
    readonly competitor: TimedWorkerResult;
    readonly gelisFirst: boolean;
  }> = [];

  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const gelisFirst = sample % 2 === 0;
    const firstFramework: Framework = gelisFirst ? "gelis" : competitor;
    const secondFramework: Framework = gelisFirst ? competitor : "gelis";

    const first = await runWorker(firstFramework, scenario, routes, false);
    const second = await runWorker(secondFramework, scenario, routes, false);

    if (first.kind !== "timed" || second.kind !== "timed") {
      throw new Error("Timed CP2-D worker emitted probe output");
    }

    pairs.push({
      gelis: gelisFirst ? first : second,
      competitor: gelisFirst ? second : first,
      gelisFirst,
    });
  }

  assertStableCompletion(
    pairs.map((pair) => pair.gelis.completion),
    `gelis/${scenario}/${routes}`,
  );
  assertStableCompletion(
    pairs.map((pair) => pair.competitor.completion),
    `${competitor}/${scenario}/${routes}`,
  );

  const pairRatios = pairs.map(
    (pair) => pair.competitor.nsPerOp / pair.gelis.nsPerOp,
  );
  const gelisFirstRatios = pairs
    .filter((pair) => pair.gelisFirst)
    .map((pair) => pair.competitor.nsPerOp / pair.gelis.nsPerOp);
  const competitorFirstRatios = pairs
    .filter((pair) => !pair.gelisFirst)
    .map((pair) => pair.competitor.nsPerOp / pair.gelis.nsPerOp);

  return {
    gelisNs: median(pairs.map((pair) => pair.gelis.nsPerOp)),
    competitorNs: median(pairs.map((pair) => pair.competitor.nsPerOp)),
    ratio: median(pairRatios),
    gelisFirstRatio: median(gelisFirstRatios),
    competitorFirstRatio: median(competitorFirstRatios),
    gelisCompletion: pairs[0]!.gelis.completion,
    competitorCompletion: pairs[0]!.competitor.completion,
  };
}

async function runWorker(
  framework: Framework,
  scenario: Scenario,
  routes: number,
  probeOnly: boolean,
): Promise<WorkerResult> {
  const args = [
    process.execPath,
    WORKER,
    `--framework=${framework}`,
    `--scenario=${scenario}`,
    `--routes=${routes}`,
  ];
  if (probeOnly) args.push("--probe-only=true");

  const child = Bun.spawn(args, {
    cwd: PACKAGE_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  const exitCode = await child.exited;
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      [
        "CP2-D worker failed",
        `framework=${framework}`,
        `scenario=${scenario}`,
        `routes=${routes}`,
        stdout,
        stderr,
      ].join("\n"),
    );
  }

  const line = stdout
    .trim()
    .split(/\r?\n/u)
    .filter((value) => value.length > 0)
    .at(-1);

  if (line === undefined) {
    throw new Error("CP2-D worker emitted no JSON");
  }

  const parsed: unknown = JSON.parse(line);
  if (!isWorkerResult(parsed)) {
    throw new Error(`Invalid CP2-D worker result: ${line}`);
  }

  return parsed;
}

function assertEnvironment(): void {
  if (Bun.version !== REQUIRED_BUN) {
    throw new Error(`CP2-D requires Bun ${REQUIRED_BUN}, received ${Bun.version}`);
  }

  assertEqual(packageVersion("hono"), REQUIRED_HONO, "Hono version");
  assertEqual(packageVersion("elysia"), REQUIRED_ELYSIA, "Elysia version");
  assertEqual(
    packageVersion("elysia-v2"),
    REQUIRED_ELYSIA_NEXT,
    "Elysia next version",
  );

  const sourceDiff = Bun.spawnSync(
    ["git", "diff", "--quiet", GELIS_SOURCE_SHA, "--", "src"],
    { cwd: ROOT, stdout: "ignore", stderr: "pipe" },
  );
  if (sourceDiff.exitCode !== 0) {
    throw new Error(`Repository src differs from frozen Gelis ${GELIS_SOURCE_SHA}`);
  }

  const status = Bun.spawnSync(["git", "status", "--porcelain"], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (status.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(status.stderr));
  }
  const dirty = new TextDecoder().decode(status.stdout).trim();
  if (dirty.length !== 0) {
    throw new Error(`CP2-D worktree must be clean:\n${dirty}`);
  }
}

function packageVersion(name: string): string {
  const path = resolve(PACKAGE_ROOT, "node_modules", name, "package.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { version?: unknown };
  if (typeof parsed.version !== "string") {
    throw new Error(`Missing version in ${path}`);
  }
  return parsed.version;
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

function assertStableCompletion(
  values: readonly CompletionMode[],
  label: string,
): void {
  const first = values[0];
  if (first === undefined || values.some((value) => value !== first)) {
    throw new Error(`Completion mode changed across samples for ${label}`);
  }
}

function isWorkerResult(value: unknown): value is WorkerResult {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.kind !== "timed" && record.kind !== "probe") return false;
  if (!allFrameworks.includes(record.framework as Framework)) return false;
  if (!scenarios.includes(record.scenario as Scenario)) return false;
  if (record.completion !== "sync" && record.completion !== "async") return false;
  if (typeof record.routes !== "number" || record.routes < 1) return false;

  if (record.kind === "probe") return true;

  return (
    typeof record.iterations === "number" &&
    record.iterations > 0 &&
    typeof record.warmups === "number" &&
    record.warmups > 0 &&
    typeof record.nsPerOp === "number" &&
    Number.isFinite(record.nsPerOp) &&
    record.nsPerOp > 0 &&
    typeof record.sink === "number"
  );
}

function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Cannot compute median of empty set");
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[midpoint]!
    : (sorted[midpoint - 1]! + sorted[midpoint]!) / 2;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function formatNs(value: number): string {
  return value.toFixed(1);
}

function formatRatio(value: number): string {
  return `${value.toFixed(4)}x`;
}

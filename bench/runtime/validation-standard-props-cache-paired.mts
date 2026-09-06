import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  bodySyncSchema,
  queryAsyncSchema,
  querySyncSchema,
} from "../http/validation/schemas.ts";

import type { StandardSchemaV1 } from "../../src/schema.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-standard-props-cache-paired.mts");

const SAMPLES = 61;
const TARGET_MS = 300;
const MIN_CALIBRATION_MS = 25;
const WARMUP_ITERATIONS = 100_000;

const scenarios = ["query-sync", "body-sync", "query-async"] as const;

type Scenario = (typeof scenarios)[number];

interface PairSample {
  readonly sample: number;
  readonly order: "current-first" | "cached-first";
  readonly currentNs: number;
  readonly cachedNs: number;
  readonly deltaNs: number;
  readonly deltaPercent: number;
}

interface ScenarioResult {
  readonly scenario: Scenario;
  readonly iterations: number;
  readonly currentMedianNs: number;
  readonly cachedMedianNs: number;
  readonly pairedMedianDeltaNs: number;
  readonly pairedMedianDeltaPercent: number;
  readonly currentCv: number;
  readonly cachedCv: number;
  readonly cachedWins: number;
  readonly currentWins: number;
  readonly ties: number;
  readonly currentFirstMedianDeltaPercent: number;
  readonly cachedFirstMedianDeltaPercent: number;
  readonly samples: readonly PairSample[];
}

let sink: unknown;

const rawQuery = Object.assign(Object.create(null) as Record<string, string>, {
  page: "42",
  q: "gelis",
});

const rawBody = {
  name: "gelis",
  count: 42,
};

const requestedScenario = readScenario();

if (requestedScenario !== undefined) {
  await runChild(requestedScenario);
} else {
  verifyReceiverSemantics();
  await runParent();
}

async function runParent(): Promise<void> {
  console.log(
    "Correctness: cached Standard Schema props preserve validate receiver PASS\n",
  );

  console.log("Gelis P7-C1 Standard Schema props-cache paired benchmark");
  console.log(`Runtime:     bun ${Bun.version}`);
  console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`Samples:     ${SAMPLES}`);
  console.log(`Target:      ${TARGET_MS} ms/side/sample`);
  console.log("Isolation:   fresh process per workload");
  console.log("Pairing:     current/cached-props same process");
  console.log("Order:       alternated every sample\n");

  const results: ScenarioResult[] = [];

  for (let index = 0; index < scenarios.length; index++) {
    const scenario = scenarios[index];

    if (scenario === undefined) {
      continue;
    }

    console.log(`[${index + 1}/${scenarios.length}] ${scenario}`);
    results.push(await runIsolatedScenario(scenario));
  }

  console.log("\nPaired results\n");

  console.table(
    results.map((result) => ({
      scenario: result.scenario,
      "current ns": round(result.currentMedianNs, 2),
      "cached ns": round(result.cachedMedianNs, 2),
      "paired Δ ns": round(result.pairedMedianDeltaNs, 2),
      "paired Δ %": round(result.pairedMedianDeltaPercent, 2),
      "current CV %": round(result.currentCv * 100, 2),
      "cached CV %": round(result.cachedCv * 100, 2),
      "cached faster": `${result.cachedWins}/${SAMPLES}`,
    })),
  );

  console.log("\nOrder-bias check\n");

  console.table(
    results.map((result) => ({
      scenario: result.scenario,
      "current-first Δ %": round(result.currentFirstMedianDeltaPercent, 2),
      "cached-first Δ %": round(result.cachedFirstMedianDeltaPercent, 2),
    })),
  );

  console.log("\nInterpretation: negative delta favors cached props.");
  console.log(
    "Primary gate: query-sync must improve by >5 ns and >3%, with both order halves negative.",
  );
  console.log(
    "Safety gate: body-sync and query-async must not regress by >5 ns and >3% with both order halves positive.",
  );

  void sink;
}

async function runIsolatedScenario(
  scenario: Scenario,
): Promise<ScenarioResult> {
  const child = Bun.spawn([process.execPath, CHILD, `--scenario=${scenario}`], {
    cwd: resolve(HERE, "../.."),
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();

  const exitCode = await child.exited;
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      [`Paired benchmark failed: ${scenario}`, stdout, stderr].join("\n"),
    );
  }

  const line = stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith("RESULT "));

  if (!line) {
    throw new Error(`Missing result: ${scenario}\n${stdout}`);
  }

  const parsed: unknown = JSON.parse(line.slice("RESULT ".length));

  if (!isScenarioResult(parsed)) {
    throw new Error(`Invalid result: ${scenario}`);
  }

  return parsed;
}

async function runChild(scenario: Scenario): Promise<void> {
  const { currentOperation, cachedOperation } = createOperations(scenario);

  warmup(currentOperation, WARMUP_ITERATIONS);
  warmup(cachedOperation, WARMUP_ITERATIONS);

  const iterations = calibratePair(currentOperation, cachedOperation);

  const samples: PairSample[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const currentFirst = sample % 2 === 0;

    let currentElapsed: number;
    let cachedElapsed: number;

    if (currentFirst) {
      currentElapsed = await measure(currentOperation, iterations);
      cachedElapsed = await measure(cachedOperation, iterations);
    } else {
      cachedElapsed = await measure(cachedOperation, iterations);
      currentElapsed = await measure(currentOperation, iterations);
    }

    const currentNs = millisecondsToNsPerOp(currentElapsed, iterations);

    const cachedNs = millisecondsToNsPerOp(cachedElapsed, iterations);

    const deltaNs = cachedNs - currentNs;
    const deltaPercent = (cachedNs / currentNs - 1) * 100;

    samples.push({
      sample: sample + 1,
      order: currentFirst ? "current-first" : "cached-first",
      currentNs,
      cachedNs,
      deltaNs,
      deltaPercent,
    });
  }

  const currentValues = samples.map((sample) => sample.currentNs);
  const cachedValues = samples.map((sample) => sample.cachedNs);
  const deltaValues = samples.map((sample) => sample.deltaNs);
  const deltaPercentValues = samples.map((sample) => sample.deltaPercent);

  const currentFirstDeltas = samples
    .filter((sample) => sample.order === "current-first")
    .map((sample) => sample.deltaPercent);

  const cachedFirstDeltas = samples
    .filter((sample) => sample.order === "cached-first")
    .map((sample) => sample.deltaPercent);

  let cachedWins = 0;
  let currentWins = 0;
  let ties = 0;

  for (const sample of samples) {
    if (sample.cachedNs < sample.currentNs) {
      cachedWins++;
    } else if (sample.cachedNs > sample.currentNs) {
      currentWins++;
    } else {
      ties++;
    }
  }

  const result: ScenarioResult = {
    scenario,
    iterations,
    currentMedianNs: median(currentValues),
    cachedMedianNs: median(cachedValues),
    pairedMedianDeltaNs: median(deltaValues),
    pairedMedianDeltaPercent: median(deltaPercentValues),
    currentCv: coefficientOfVariation(currentValues),
    cachedCv: coefficientOfVariation(cachedValues),
    cachedWins,
    currentWins,
    ties,
    currentFirstMedianDeltaPercent: median(currentFirstDeltas),
    cachedFirstMedianDeltaPercent: median(cachedFirstDeltas),
    samples,
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

function createOperations(scenario: Scenario): {
  readonly currentOperation: () => unknown;
  readonly cachedOperation: () => unknown;
} {
  switch (scenario) {
    case "query-sync": {
      const schema = querySyncSchema;
      const standard = schema["~standard"];

      return {
        currentOperation: () => {
          sink = schema["~standard"].validate(rawQuery);
          return sink;
        },
        cachedOperation: () => {
          sink = standard.validate(rawQuery);
          return sink;
        },
      };
    }

    case "body-sync": {
      const schema = bodySyncSchema;
      const standard = schema["~standard"];

      return {
        currentOperation: () => {
          sink = schema["~standard"].validate(rawBody);
          return sink;
        },
        cachedOperation: () => {
          sink = standard.validate(rawBody);
          return sink;
        },
      };
    }

    case "query-async": {
      const schema = queryAsyncSchema;
      const standard = schema["~standard"];

      return {
        currentOperation: async () => {
          sink = await schema["~standard"].validate(rawQuery);
          return sink;
        },
        cachedOperation: async () => {
          sink = await standard.validate(rawQuery);
          return sink;
        },
      };
    }
  }
}

function verifyReceiverSemantics(): void {
  const standard = {
    version: 1 as const,
    vendor: "receiver-check",
    marker: 42,
    validate(this: { marker: number }, value: unknown) {
      return {
        value: [this.marker, value] as const,
      };
    },
  };

  const schema = {
    "~standard": standard,
  };

  const current = schema["~standard"].validate("gelis");
  const cached = standard.validate("gelis");

  if (
    current.value[0] !== cached.value[0] ||
    current.value[1] !== cached.value[1]
  ) {
    throw new Error("Cached props changed validate receiver semantics");
  }
}

function warmup(operation: () => unknown, iterations: number): void {
  for (let index = 0; index < iterations; index++) {
    void operation();
  }
}

function calibratePair(current: () => unknown, cached: () => unknown): number {
  let iterations = 1000;

  while (true) {
    const currentElapsed = measureSync(current, iterations);

    const cachedElapsed = measureSync(cached, iterations);

    const slowerElapsed = Math.max(currentElapsed, cachedElapsed);

    if (slowerElapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(slowerElapsed, 0.001)),
      );
    }

    iterations *= 2;
  }
}

function measureSync(operation: () => unknown, iterations: number): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    void operation();
  }

  return performance.now() - start;
}

async function measure(
  operation: () => unknown,
  iterations: number,
): Promise<number> {
  const first = operation();

  if (isPromiseLike(first)) {
    await first;

    const start = performance.now();

    for (let index = 0; index < iterations; index++) {
      await operation();
    }

    return performance.now() - start;
  }

  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    void operation();
  }

  return performance.now() - start;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

function millisecondsToNsPerOp(
  elapsedMilliseconds: number,
  iterations: number,
): number {
  return (elapsedMilliseconds * 1_000_000) / iterations;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    const value = sorted[middle];

    if (value === undefined) {
      throw new Error("Cannot compute median of empty samples");
    }

    return value;
  }

  const left = sorted[middle - 1];
  const right = sorted[middle];

  if (left === undefined || right === undefined) {
    throw new Error("Cannot compute median of empty samples");
  }

  return (left + right) / 2;
}

function coefficientOfVariation(values: readonly number[]): number {
  const mean =
    values.reduce((total, value) => total + value, 0) / values.length;

  if (mean === 0) {
    return 0;
  }

  const variance =
    values.reduce((total, value) => {
      const difference = value - mean;

      return total + difference * difference;
    }, 0) / values.length;

  return Math.sqrt(variance) / mean;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function readScenario(): Scenario | undefined {
  const prefix = "--scenario=";

  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (!argument) {
    return undefined;
  }

  const candidate = argument.slice(prefix.length);

  return scenarios.find((scenario) => scenario === candidate);
}

function isScenarioResult(value: unknown): value is ScenarioResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ScenarioResult>;

  return (
    typeof candidate.scenario === "string" &&
    scenarios.includes(candidate.scenario as Scenario) &&
    typeof candidate.iterations === "number" &&
    typeof candidate.currentMedianNs === "number" &&
    typeof candidate.cachedMedianNs === "number" &&
    typeof candidate.pairedMedianDeltaNs === "number" &&
    typeof candidate.pairedMedianDeltaPercent === "number" &&
    typeof candidate.currentCv === "number" &&
    typeof candidate.cachedCv === "number" &&
    typeof candidate.cachedWins === "number" &&
    typeof candidate.currentWins === "number" &&
    typeof candidate.ties === "number" &&
    typeof candidate.currentFirstMedianDeltaPercent === "number" &&
    typeof candidate.cachedFirstMedianDeltaPercent === "number" &&
    Array.isArray(candidate.samples)
  );
}

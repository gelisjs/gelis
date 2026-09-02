import assert from "node:assert/strict";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-content-type-paired.mts");

const SAMPLES = 21;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 25;
const WARMUP_ITERATIONS = 100_000;

const pairs = ["exact", "params", "suffix", "mixed"] as const;

type PairName = (typeof pairs)[number];

interface PairDefinition {
  readonly baseline: () => boolean;
  readonly candidate: () => boolean;
}

interface PairSample {
  readonly order: "baseline-first" | "candidate-first";

  readonly baselineNs: number;
  readonly candidateNs: number;

  readonly deltaNs: number;
  readonly deltaPercent: number;
}

interface PairResult {
  readonly pair: PairName;

  readonly baselineMedianNs: number;
  readonly candidateMedianNs: number;

  readonly pairedMedianDeltaNs: number;
  readonly pairedMedianDeltaPercent: number;

  readonly baselineCv: number;
  readonly candidateCv: number;

  readonly candidateWins: number;

  readonly baselineFirstDeltaPercent: number;
  readonly candidateFirstDeltaPercent: number;
}

const EXACT = createRequest("application/json");

const PARAMS = createRequest("application/json; charset=utf-8");

const SUFFIX = createRequest("application/problem+json");

const MIXED = [
  EXACT,
  EXACT,
  EXACT,
  EXACT,
  EXACT,
  EXACT,
  PARAMS,
  SUFFIX,
] as const;

let sink = false;

const requestedPair = readPair();

if (requestedPair !== undefined) {
  runChild(requestedPair);
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  runCorrectnessGate();

  console.log("\nGelis Content-Type paired benchmark");

  console.log(`Runtime:    bun ${Bun.version}`);
  console.log(`CPU:        ${cpus()[0]?.model ?? "unknown"}`);

  console.log(`Samples:    ${SAMPLES}`);
  console.log("Isolation:  fresh process per comparison");

  console.log("Pairing:    current/candidate same process");

  console.log("Order:      alternated every sample\n");

  const results: PairResult[] = [];

  for (let index = 0; index < pairs.length; index++) {
    const pair = pairs[index];

    if (pair === undefined) {
      continue;
    }

    console.log(`[${index + 1}/${pairs.length}] ${pair}`);

    results.push(await runIsolatedPair(pair));
  }

  console.log("\nResults\n");

  console.table(
    results.map((result) => ({
      workload: result.pair,

      "current ns": round(result.baselineMedianNs, 2),

      "candidate ns": round(result.candidateMedianNs, 2),

      "paired Δ ns": round(result.pairedMedianDeltaNs, 2),

      "paired Δ %": round(result.pairedMedianDeltaPercent, 2),

      "current CV %": round(result.baselineCv * 100, 2),

      "candidate CV %": round(result.candidateCv * 100, 2),

      wins: `${result.candidateWins}/${SAMPLES}`,
    })),
  );

  console.log("\nOrder-bias check\n");

  console.table(
    results.map((result) => ({
      workload: result.pair,

      "current-first Δ %": round(result.baselineFirstDeltaPercent, 2),

      "candidate-first Δ %": round(result.candidateFirstDeltaPercent, 2),
    })),
  );

  console.log("\nNegative delta favors candidate.");

  void sink;
}

function runCorrectnessGate(): void {
  const cases: Array<{
    readonly contentType: string | undefined;
    readonly expected: boolean;
  }> = [
    {
      contentType: undefined,
      expected: false,
    },
    {
      contentType: "",
      expected: false,
    },
    {
      contentType: "application/json",
      expected: true,
    },
    {
      contentType: "APPLICATION/JSON",
      expected: true,
    },
    {
      contentType: " application/json ",
      expected: true,
    },
    {
      contentType: "application/json; charset=utf-8",
      expected: true,
    },
    {
      contentType: "Application/Json; Charset=UTF-8",
      expected: true,
    },
    {
      contentType: "application/problem+json",
      expected: true,
    },
    {
      contentType: "application/vnd.api+json",
      expected: true,
    },
    {
      contentType: "application/problem+json; charset=utf-8",
      expected: true,
    },
    {
      contentType: "text/json",
      expected: false,
    },
    {
      contentType: "application/jsonp",
      expected: false,
    },
    {
      contentType: "application/problem+jsonx",
      expected: false,
    },
    {
      contentType: "text/plain",
      expected: false,
    },
  ];

  for (const testCase of cases) {
    const request =
      testCase.contentType === undefined
        ? new Request("http://gelis.test/")
        : createRequest(testCase.contentType);

    const current = isJsonContentTypeCurrent(request);

    const candidate = isJsonContentTypeFast(request);

    assert.equal(
      current,
      testCase.expected,
      `Current mismatch: ${String(testCase.contentType)}`,
    );

    assert.equal(
      candidate,
      current,
      `Candidate semantic mismatch: ${String(testCase.contentType)}`,
    );
  }

  console.log(`Correctness: ${cases.length}/${cases.length} PASS`);
}

async function runIsolatedPair(pair: PairName): Promise<PairResult> {
  const child = Bun.spawn([process.execPath, CHILD, `--pair=${pair}`], {
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
      [`Content-Type benchmark failed: ${pair}`, stdout, stderr].join("\n"),
    );
  }

  const line = stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith("RESULT "));

  if (!line) {
    throw new Error(`Missing result: ${pair}\n${stdout}`);
  }

  const parsed: unknown = JSON.parse(line.slice("RESULT ".length));

  if (!isPairResult(parsed)) {
    throw new Error(`Invalid result: ${pair}`);
  }

  return parsed;
}

function runChild(pair: PairName): void {
  const definition = createPair(pair);

  warmup(definition.baseline, WARMUP_ITERATIONS);

  warmup(definition.candidate, WARMUP_ITERATIONS);

  const iterations = calibratePair(definition.baseline, definition.candidate);

  const samples: PairSample[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const baselineFirst = sample % 2 === 0;

    let baselineElapsed: number;
    let candidateElapsed: number;

    if (baselineFirst) {
      baselineElapsed = measure(definition.baseline, iterations);

      candidateElapsed = measure(definition.candidate, iterations);
    } else {
      candidateElapsed = measure(definition.candidate, iterations);

      baselineElapsed = measure(definition.baseline, iterations);
    }

    const baselineNs = millisecondsToNsPerOp(baselineElapsed, iterations);

    const candidateNs = millisecondsToNsPerOp(candidateElapsed, iterations);

    samples.push({
      order: baselineFirst ? "baseline-first" : "candidate-first",

      baselineNs,
      candidateNs,

      deltaNs: candidateNs - baselineNs,

      deltaPercent: (candidateNs / baselineNs - 1) * 100,
    });
  }

  const baselineValues = samples.map((sample) => sample.baselineNs);

  const candidateValues = samples.map((sample) => sample.candidateNs);

  const deltaValues = samples.map((sample) => sample.deltaNs);

  const deltaPercentValues = samples.map((sample) => sample.deltaPercent);

  const baselineFirstValues = samples
    .filter((sample) => sample.order === "baseline-first")
    .map((sample) => sample.deltaPercent);

  const candidateFirstValues = samples
    .filter((sample) => sample.order === "candidate-first")
    .map((sample) => sample.deltaPercent);

  const result: PairResult = {
    pair,

    baselineMedianNs: median(baselineValues),

    candidateMedianNs: median(candidateValues),

    pairedMedianDeltaNs: median(deltaValues),

    pairedMedianDeltaPercent: median(deltaPercentValues),

    baselineCv: coefficientOfVariation(baselineValues),

    candidateCv: coefficientOfVariation(candidateValues),

    candidateWins: samples.filter(
      (sample) => sample.candidateNs < sample.baselineNs,
    ).length,

    baselineFirstDeltaPercent: median(baselineFirstValues),

    candidateFirstDeltaPercent: median(candidateFirstValues),
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

function createPair(pair: PairName): PairDefinition {
  switch (pair) {
    case "exact":
      return {
        baseline: () => isJsonContentTypeCurrent(EXACT),

        candidate: () => isJsonContentTypeFast(EXACT),
      };

    case "params":
      return {
        baseline: () => isJsonContentTypeCurrent(PARAMS),

        candidate: () => isJsonContentTypeFast(PARAMS),
      };

    case "suffix":
      return {
        baseline: () => isJsonContentTypeCurrent(SUFFIX),

        candidate: () => isJsonContentTypeFast(SUFFIX),
      };

    case "mixed": {
      let baselineCursor = 0;
      let candidateCursor = 0;

      return {
        baseline() {
          const request = MIXED[baselineCursor & (MIXED.length - 1)];

          baselineCursor++;

          if (request === undefined) {
            throw new Error("Missing mixed request");
          }

          return isJsonContentTypeCurrent(request);
        },

        candidate() {
          const request = MIXED[candidateCursor & (MIXED.length - 1)];

          candidateCursor++;

          if (request === undefined) {
            throw new Error("Missing mixed request");
          }

          return isJsonContentTypeFast(request);
        },
      };
    }
  }
}

/*
 * Model of the current Gelis behavior.
 */
function isJsonContentTypeCurrent(request: Request): boolean {
  const contentType = request.headers.get("content-type");

  if (contentType === null) {
    return false;
  }

  const separator = contentType.indexOf(";");

  const mediaType = (
    separator === -1 ? contentType : contentType.slice(0, separator)
  )
    .trim()
    .toLowerCase();

  return (
    mediaType === "application/json" ||
    (mediaType.startsWith("application/") && mediaType.endsWith("+json"))
  );
}

/*
 * Candidate:
 *
 * optimize the overwhelmingly common canonical
 * Content-Type without changing fallback semantics.
 */
function isJsonContentTypeFast(request: Request): boolean {
  const contentType = request.headers.get("content-type");

  if (contentType === null) {
    return false;
  }

  if (contentType === "application/json") {
    return true;
  }

  const separator = contentType.indexOf(";");

  const mediaType = (
    separator === -1 ? contentType : contentType.slice(0, separator)
  )
    .trim()
    .toLowerCase();

  return (
    mediaType === "application/json" ||
    (mediaType.startsWith("application/") && mediaType.endsWith("+json"))
  );
}

function createRequest(contentType: string): Request {
  return new Request("http://gelis.test/", {
    method: "POST",

    headers: {
      "content-type": contentType,
    },

    body: "{}",
  });
}

function warmup(operation: () => boolean, iterations: number): void {
  for (let index = 0; index < iterations; index++) {
    sink = operation();
  }
}

function calibratePair(
  baseline: () => boolean,
  candidate: () => boolean,
): number {
  let iterations = 1000;

  while (true) {
    const baselineElapsed = measure(baseline, iterations);

    const candidateElapsed = measure(candidate, iterations);

    const slowerElapsed = Math.max(baselineElapsed, candidateElapsed);

    if (slowerElapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(slowerElapsed, 0.001)),
      );
    }

    iterations *= 2;
  }
}

function measure(operation: () => boolean, iterations: number): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    sink = operation();
  }

  return performance.now() - start;
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

  const value = sorted[middle];

  if (value === undefined) {
    throw new Error("Cannot compute median");
  }

  return value;
}

function coefficientOfVariation(values: readonly number[]): number {
  const average =
    values.reduce((total, value) => total + value, 0) / values.length;

  if (average === 0) {
    return 0;
  }

  const variance =
    values.reduce((total, value) => {
      const delta = value - average;

      return total + delta * delta;
    }, 0) / values.length;

  return Math.sqrt(variance) / average;
}

function readPair(): PairName | undefined {
  const prefix = "--pair=";

  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (!argument) {
    return undefined;
  }

  const value = argument.slice(prefix.length);

  if (!pairs.includes(value as PairName)) {
    throw new Error(`Unknown pair: ${value}`);
  }

  return value as PairName;
}

function isPairResult(value: unknown): value is PairResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "pair" in value &&
    typeof value.pair === "string" &&
    pairs.includes(value.pair as PairName) &&
    "pairedMedianDeltaNs" in value &&
    typeof value.pairedMedianDeltaNs === "number"
  );
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

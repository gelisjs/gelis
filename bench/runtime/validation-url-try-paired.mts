import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseQueryFromUrl } from "../../src/runtime/input.ts";
import { pathnameFromUrl } from "../../src/runtime/url.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-url-try-paired.mts");

const SAMPLES = 21;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 25;
const WARMUP_ITERATIONS = 100_000;

const REQUEST = new Request("http://gelis.test/r/4999?page=42&q=gelis");

const CACHED_URL = REQUEST.url;

const pairs = [
  "property-to-cached",
  "two-read-to-one-read",
  "try-to-direct",
] as const;

type PairName = (typeof pairs)[number];

interface PairDefinition {
  readonly baselineName: string;
  readonly candidateName: string;
  readonly baseline: () => void;
  readonly candidate: () => void;
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
  readonly baselineName: string;
  readonly candidateName: string;

  readonly baselineMedianNs: number;
  readonly candidateMedianNs: number;

  readonly pairedMedianDeltaNs: number;
  readonly pairedMedianDeltaPercent: number;

  readonly baselineCv: number;
  readonly candidateCv: number;

  readonly candidateWins: number;

  readonly baselineFirstMedianDeltaPercent: number;
  readonly candidateFirstMedianDeltaPercent: number;

  readonly samples: readonly PairSample[];
}

let pathnameSink: unknown;
let querySink: unknown;

const requestedPair = readPair();

if (requestedPair !== undefined) {
  runChild(requestedPair);
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  console.log("\nGelis validation URL / try attribution");
  console.log(`Runtime:    bun ${Bun.version}`);
  console.log(`CPU:        ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`Samples:    ${SAMPLES}`);
  console.log("Isolation:  fresh process per comparison");
  console.log("Pairing:    same process");
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
      comparison: `${result.baselineName} → ${result.candidateName}`,
      "baseline ns": round(result.baselineMedianNs, 2),
      "candidate ns": round(result.candidateMedianNs, 2),
      "paired Δ ns": round(result.pairedMedianDeltaNs, 2),
      "paired Δ %": round(result.pairedMedianDeltaPercent, 2),
      "baseline CV %": round(result.baselineCv * 100, 2),
      "candidate CV %": round(result.candidateCv * 100, 2),
      wins: `${result.candidateWins}/${SAMPLES}`,
    })),
  );

  console.log("\nOrder-bias check\n");

  console.table(
    results.map((result) => ({
      comparison: `${result.baselineName} → ${result.candidateName}`,
      "baseline-first Δ %": round(result.baselineFirstMedianDeltaPercent, 2),
      "candidate-first Δ %": round(result.candidateFirstMedianDeltaPercent, 2),
    })),
  );

  console.log("\nNegative delta favors candidate.");

  void pathnameSink;
  void querySink;
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
      [`URL/try benchmark failed: ${pair}`, stdout, stderr].join("\n"),
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

function runChild(pairName: PairName): void {
  const definition = createPair(pairName);

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

  const deltas = samples.map((sample) => sample.deltaNs);

  const deltaPercentages = samples.map((sample) => sample.deltaPercent);

  const baselineFirstDeltas = samples
    .filter((sample) => sample.order === "baseline-first")
    .map((sample) => sample.deltaPercent);

  const candidateFirstDeltas = samples
    .filter((sample) => sample.order === "candidate-first")
    .map((sample) => sample.deltaPercent);

  const candidateWins = samples.filter(
    (sample) => sample.candidateNs < sample.baselineNs,
  ).length;

  const result: PairResult = {
    pair: pairName,

    baselineName: definition.baselineName,
    candidateName: definition.candidateName,

    baselineMedianNs: median(baselineValues),
    candidateMedianNs: median(candidateValues),

    pairedMedianDeltaNs: median(deltas),
    pairedMedianDeltaPercent: median(deltaPercentages),

    baselineCv: coefficientOfVariation(baselineValues),
    candidateCv: coefficientOfVariation(candidateValues),

    candidateWins,

    baselineFirstMedianDeltaPercent: median(baselineFirstDeltas),

    candidateFirstMedianDeltaPercent: median(candidateFirstDeltas),

    samples,
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void pathnameSink;
  void querySink;
}

function createPair(pair: PairName): PairDefinition {
  switch (pair) {
    /*
     * Pure Request.url getter attribution.
     *
     * Candidate receives the URL string that a caller
     * already captured earlier in the request.
     */
    case "property-to-cached":
      return {
        baselineName: "parse-request.url",
        candidateName: "parse-cached-url",

        baseline() {
          querySink = parseQueryFromUrl(REQUEST.url);
        },

        candidate() {
          querySink = parseQueryFromUrl(CACHED_URL);
        },
      };

    /*
     * Models the actual Gelis request shape:
     *
     * baseline:
     *   pathnameFromUrl(request.url)
     *   parseQueryFromUrl(request.url)
     *
     * candidate:
     *   const url = request.url
     *   pathnameFromUrl(url)
     *   parseQueryFromUrl(url)
     *
     * Both retain the malformed-query try/catch.
     */
    case "two-read-to-one-read":
      return {
        baselineName: "route+query-two-url-reads",
        candidateName: "route+query-one-url-read",

        baseline() {
          pathnameSink = pathnameFromUrl(REQUEST.url);

          try {
            querySink = parseQueryFromUrl(REQUEST.url);
          } catch {
            querySink = undefined;
          }
        },

        candidate() {
          const url = REQUEST.url;

          pathnameSink = pathnameFromUrl(url);

          try {
            querySink = parseQueryFromUrl(url);
          } catch {
            querySink = undefined;
          }
        },
      };

    /*
     * Theoretical attribution only.
     *
     * Removing the catch is NOT a production candidate,
     * because malformed percent encoding must remain a
     * normal 400 response.
     */
    case "try-to-direct":
      return {
        baselineName: "parse-with-try",
        candidateName: "parse-direct",

        baseline() {
          try {
            querySink = parseQueryFromUrl(CACHED_URL);
          } catch {
            querySink = undefined;
          }
        },

        candidate() {
          querySink = parseQueryFromUrl(CACHED_URL);
        },
      };
  }
}

function warmup(operation: () => void, iterations: number): void {
  for (let index = 0; index < iterations; index++) {
    operation();
  }
}

function calibratePair(baseline: () => void, candidate: () => void): number {
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

function measure(operation: () => void, iterations: number): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
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

function readPair(): PairName | undefined {
  const prefix = "--pair=";

  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (!argument) {
    return undefined;
  }

  const value = argument.slice(prefix.length);

  if (!pairs.includes(value as PairName)) {
    throw new Error(`Unknown URL/try pair: ${value}`);
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
    "baselineMedianNs" in value &&
    typeof value.baselineMedianNs === "number" &&
    "candidateMedianNs" in value &&
    typeof value.candidateMedianNs === "number" &&
    "pairedMedianDeltaNs" in value &&
    typeof value.pairedMedianDeltaNs === "number" &&
    "pairedMedianDeltaPercent" in value &&
    typeof value.pairedMedianDeltaPercent === "number" &&
    "candidateWins" in value &&
    typeof value.candidateWins === "number" &&
    "samples" in value &&
    Array.isArray(value.samples)
  );
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

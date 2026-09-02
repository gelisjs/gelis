import assert from "node:assert/strict";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { Gelis } from "../../src/index";

import type { StandardSchemaV1 } from "../../src/index";

const HERE = dirname(fileURLToPath(import.meta.url));

const CHILD = resolve(HERE, "response-zero-unused.mts");

const SAMPLES = 21;

const TARGET_MS = 150;

const MIN_CALIBRATION_MS = 25;

const WARMUP_ITERATIONS = 20_000;

const REQUEST = new Request("http://gelis.test/bench");

const RAW_RESPONSE = new Response(null, {
  status: 204,
});

interface PairSample {
  readonly order: "plain-first" | "metadata-first";

  readonly plainNs: number;

  readonly metadataNs: number;

  readonly deltaNs: number;

  readonly deltaPercent: number;
}

interface PairResult {
  readonly plainMedianNs: number;

  readonly metadataMedianNs: number;

  readonly pairedMedianDeltaNs: number;

  readonly pairedMedianDeltaPercent: number;

  readonly plainCv: number;

  readonly metadataCv: number;

  readonly metadataWins: number;

  readonly plainFirstDeltaPercent: number;

  readonly metadataFirstDeltaPercent: number;
}

let sink: Response | Promise<Response>;

if (process.argv.includes("--child")) {
  runChild();
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  await runCorrectnessGate();

  console.log("\nGelis response zero-unused paired benchmark");

  console.log(`Runtime:    bun ${Bun.version}`);

  console.log(`CPU:        ${cpus()[0]?.model ?? "unknown"}`);

  console.log(`Samples:    ${SAMPLES}`);

  console.log("Comparison: plain route vs metadata-only response contract");

  console.log("Handler:    identical prebuilt raw Response");

  console.log("Pairing:    same process");

  console.log("Order:      alternated every sample");

  console.log("Isolation:  fresh child process\n");

  const child = Bun.spawn(
    [process.execPath, CHILD, "--child"],

    {
      cwd: resolve(HERE, "../.."),

      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdoutPromise = new Response(child.stdout).text();

  const stderrPromise = new Response(child.stderr).text();

  const exitCode = await child.exited;

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      ["Response zero-unused benchmark failed", stdout, stderr].join("\n"),
    );
  }

  const line = stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith("RESULT "));

  if (line === undefined) {
    throw new Error(`Missing benchmark result\n${stdout}`);
  }

  const parsed: unknown = JSON.parse(line.slice("RESULT ".length));

  if (!isPairResult(parsed)) {
    throw new Error("Invalid benchmark result");
  }

  console.log("Results\n");

  console.table([
    {
      workload: "plain",
      "median ns/op": round(parsed.plainMedianNs, 2),
      "CV %": round(parsed.plainCv * 100, 2),
    },

    {
      workload: "metadata-only",
      "median ns/op": round(parsed.metadataMedianNs, 2),
      "CV %": round(parsed.metadataCv * 100, 2),
    },
  ]);

  console.log("\nPaired result\n");

  console.table([
    {
      "Δ ns": round(parsed.pairedMedianDeltaNs, 2),

      "Δ %": round(parsed.pairedMedianDeltaPercent, 2),

      "metadata wins": `${parsed.metadataWins}/${SAMPLES}`,

      "plain-first Δ %": round(parsed.plainFirstDeltaPercent, 2),

      "metadata-first Δ %": round(parsed.metadataFirstDeltaPercent, 2),
    },
  ]);

  console.log("\nPositive delta means metadata-only was slower.");

  console.log(
    "For zero-unused acceptance, delta should be statistically indistinguishable from noise.",
  );

  void sink;
}

async function runCorrectnessGate(): Promise<void> {
  let validations = 0;

  const Schema = createSchema<Response>(() => {
    validations++;

    return {
      value: RAW_RESPONSE,
    };
  });

  const plain = new Gelis();

  plain.get("/bench", () => RAW_RESPONSE);

  const metadata = new Gelis();

  metadata.get(
    "/bench",

    {
      responses: {
        200: Schema,
      },
    },

    () => RAW_RESPONSE,
  );

  const plainResult = plain.fetch(REQUEST);

  const metadataResult = metadata.fetch(REQUEST);

  assert.equal(plainResult, RAW_RESPONSE);

  assert.equal(metadataResult, RAW_RESPONSE);

  assert.equal(validations, 0, "metadata-only response schema executed");

  console.log("Correctness: PASS");
}

function runChild(): void {
  const Schema = createSchema<Response>();

  const plain = new Gelis();

  plain.get("/bench", () => RAW_RESPONSE);

  const metadata = new Gelis();

  metadata.get(
    "/bench",

    {
      responses: {
        200: Schema,
      },
    },

    () => RAW_RESPONSE,
  );

  const plainOperation = () => plain.fetch(REQUEST);

  const metadataOperation = () => metadata.fetch(REQUEST);

  warmup(plainOperation, WARMUP_ITERATIONS);

  warmup(metadataOperation, WARMUP_ITERATIONS);

  const iterations = calibratePair(plainOperation, metadataOperation);

  const samples: PairSample[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const plainFirst = sample % 2 === 0;

    let plainElapsed: number;

    let metadataElapsed: number;

    if (plainFirst) {
      plainElapsed = measure(plainOperation, iterations);

      metadataElapsed = measure(metadataOperation, iterations);
    } else {
      metadataElapsed = measure(metadataOperation, iterations);

      plainElapsed = measure(plainOperation, iterations);
    }

    const plainNs = millisecondsToNsPerOp(plainElapsed, iterations);

    const metadataNs = millisecondsToNsPerOp(metadataElapsed, iterations);

    samples.push({
      order: plainFirst ? "plain-first" : "metadata-first",

      plainNs,

      metadataNs,

      deltaNs: metadataNs - plainNs,

      deltaPercent: (metadataNs / plainNs - 1) * 100,
    });
  }

  const plainValues = samples.map((sample) => sample.plainNs);

  const metadataValues = samples.map((sample) => sample.metadataNs);

  const deltaValues = samples.map((sample) => sample.deltaNs);

  const deltaPercentValues = samples.map((sample) => sample.deltaPercent);

  const plainFirstValues = samples
    .filter((sample) => sample.order === "plain-first")
    .map((sample) => sample.deltaPercent);

  const metadataFirstValues = samples
    .filter((sample) => sample.order === "metadata-first")
    .map((sample) => sample.deltaPercent);

  const result: PairResult = {
    plainMedianNs: median(plainValues),

    metadataMedianNs: median(metadataValues),

    pairedMedianDeltaNs: median(deltaValues),

    pairedMedianDeltaPercent: median(deltaPercentValues),

    plainCv: coefficientOfVariation(plainValues),

    metadataCv: coefficientOfVariation(metadataValues),

    metadataWins: samples.filter((sample) => sample.metadataNs < sample.plainNs)
      .length,

    plainFirstDeltaPercent: median(plainFirstValues),

    metadataFirstDeltaPercent: median(metadataFirstValues),
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

function warmup(
  operation: () => Response | Promise<Response>,

  iterations: number,
): void {
  for (let index = 0; index < iterations; index++) {
    sink = operation();
  }
}

function calibratePair(
  plain: () => Response | Promise<Response>,

  metadata: () => Response | Promise<Response>,
): number {
  let iterations = 1000;

  while (true) {
    const plainElapsed = measure(plain, iterations);

    const metadataElapsed = measure(metadata, iterations);

    const slowerElapsed = Math.max(plainElapsed, metadataElapsed);

    if (slowerElapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,

        Math.round((iterations * TARGET_MS) / Math.max(slowerElapsed, 0.001)),
      );
    }

    iterations *= 2;
  }
}

function measure(
  operation: () => Response | Promise<Response>,

  iterations: number,
): number {
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

function isPairResult(value: unknown): value is PairResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "plainMedianNs" in value &&
    typeof value.plainMedianNs === "number" &&
    "metadataMedianNs" in value &&
    typeof value.metadataMedianNs === "number" &&
    "pairedMedianDeltaPercent" in value &&
    typeof value.pairedMedianDeltaPercent === "number"
  );
}

function createSchema<Input = unknown, Output = Input>(
  validate: (
    value: unknown,
  ) =>
    | StandardSchemaV1.Result<Output>
    | Promise<StandardSchemaV1.Result<Output>> = (value) => ({
    value: value as Output,
  }),
): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1,

      vendor: "gelis-bench",

      validate,
    },
  } as StandardSchemaV1<Input, Output>;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

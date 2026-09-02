import assert from "node:assert/strict";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { Gelis } from "../../src/index";

import type { StandardSchemaV1 } from "../../src/index";

const HERE = dirname(fileURLToPath(import.meta.url));

const CHILD = resolve(HERE, "response-contracts.mts");

const SAMPLES = 21;

const TARGET_MS = 150;

const MIN_CALIBRATION_MS = 25;

const WARMUP_ITERATIONS = 20_000;

const REQUEST = new Request("http://gelis.test/bench");

const JSON_INIT = {
  status: 200,
};

const JSON_CONTENT_TYPE = "application/json;charset=utf-8";

const TEXT_INIT = {
  status: 200,

  headers: {
    "content-type": "text/plain; charset=utf-8",
  },
};

const PAYLOAD = {
  id: "user-1",

  name: "Gelis",
};

const VALIDATION_INPUT = {
  id: "user-1",

  name: " Gelis ",
};

const VALIDATED_PAYLOAD = {
  id: "user-1",

  name: "Gelis",

  normalized: true as const,
};

const VALIDATION_RESULT = {
  value: VALIDATED_PAYLOAD,
};

const TEXT = "created";

const RAW_RESPONSE = new Response(
  null,

  {
    status: 204,
  },
);

const pairs = [
  "raw-bypass",
  "json",
  "text",
  "validate-auto",
  "validate-json",
  "reply-status",
] as const;

type PairName = (typeof pairs)[number];

type PairOperation = () => Response;

interface PairDefinition {
  readonly control: PairOperation;

  readonly managed: PairOperation;

  readonly expectedStatus: number;

  readonly expectedBody: string;

  readonly expectedContentType: string | null;

  readonly rawIdentity?: boolean;
}

interface PairSample {
  readonly order: "control-first" | "managed-first";

  readonly controlNs: number;

  readonly managedNs: number;

  readonly deltaNs: number;

  readonly deltaPercent: number;
}

interface PairResult {
  readonly pair: PairName;

  readonly controlMedianNs: number;

  readonly managedMedianNs: number;

  readonly pairedMedianDeltaNs: number;

  readonly pairedMedianDeltaPercent: number;

  readonly controlCv: number;

  readonly managedCv: number;

  readonly managedWins: number;

  readonly controlFirstDeltaPercent: number;

  readonly managedFirstDeltaPercent: number;
}

let sink: Response;

const requestedPair = readPair();

if (requestedPair === undefined) {
  await runParent();
} else {
  runChild(requestedPair);
}

async function runParent(): Promise<void> {
  await runCorrectnessGate();

  console.log("\nGelis response contracts runtime benchmark");

  console.log(`Runtime:    bun ${Bun.version}`);

  console.log(`CPU:        ${cpus()[0]?.model ?? "unknown"}`);

  console.log(`Samples:    ${SAMPLES}`);

  console.log("Isolation:  fresh process per pair");

  console.log("Pairing:    control/managed same process");

  console.log("Order:      alternated every sample");

  console.log("Control:    hand-written equivalent fast path\n");

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

      "control ns": round(result.controlMedianNs, 2),

      "managed ns": round(result.managedMedianNs, 2),

      "paired Δ ns": round(result.pairedMedianDeltaNs, 2),

      "paired Δ %": round(result.pairedMedianDeltaPercent, 2),

      "control CV %": round(result.controlCv * 100, 2),

      "managed CV %": round(result.managedCv * 100, 2),

      wins: `${result.managedWins}/${SAMPLES}`,
    })),
  );

  console.log("\nOrder-bias check\n");

  console.table(
    results.map((result) => ({
      workload: result.pair,

      "control-first Δ %": round(result.controlFirstDeltaPercent, 2),

      "managed-first Δ %": round(result.managedFirstDeltaPercent, 2),
    })),
  );

  console.log("\nPositive delta means managed response handling was slower.");

  console.log("Negative delta means managed response handling was faster.");

  void sink;
}

async function runCorrectnessGate(): Promise<void> {
  for (const pair of pairs) {
    const definition = createPair(pair);

    const control = definition.control();

    const managed = definition.managed();

    assert.ok(control instanceof Response);

    assert.ok(managed instanceof Response);

    assert.equal(
      control.status,
      definition.expectedStatus,

      `${pair}: control status`,
    );

    assert.equal(
      managed.status,
      definition.expectedStatus,

      `${pair}: managed status`,
    );

    assert.equal(
      control.headers.get("content-type"),
      definition.expectedContentType,

      `${pair}: control content-type`,
    );

    assert.equal(
      managed.headers.get("content-type"),
      definition.expectedContentType,

      `${pair}: managed content-type`,
    );

    if (definition.rawIdentity === true) {
      assert.equal(
        control,
        RAW_RESPONSE,

        `${pair}: control raw identity`,
      );

      assert.equal(
        managed,
        RAW_RESPONSE,

        `${pair}: managed raw identity`,
      );
    }

    assert.equal(
      await control.text(),
      definition.expectedBody,

      `${pair}: control body`,
    );

    assert.equal(
      await managed.text(),
      definition.expectedBody,

      `${pair}: managed body`,
    );
  }

  console.log(`Correctness: ${pairs.length}/${pairs.length} PASS`);
}

async function runIsolatedPair(pair: PairName): Promise<PairResult> {
  const child = Bun.spawn(
    [process.execPath, CHILD, `--pair=${pair}`],

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
      [`Response benchmark failed: ${pair}`, stdout, stderr].join("\n"),
    );
  }

  const line = stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith("RESULT "));

  if (line === undefined) {
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

  warmup(definition.control, WARMUP_ITERATIONS);

  warmup(definition.managed, WARMUP_ITERATIONS);

  const iterations = calibratePair(definition.control, definition.managed);

  const samples: PairSample[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const controlFirst = sample % 2 === 0;

    let controlElapsed: number;

    let managedElapsed: number;

    if (controlFirst) {
      controlElapsed = measure(definition.control, iterations);

      managedElapsed = measure(definition.managed, iterations);
    } else {
      managedElapsed = measure(definition.managed, iterations);

      controlElapsed = measure(definition.control, iterations);
    }

    const controlNs = millisecondsToNsPerOp(controlElapsed, iterations);

    const managedNs = millisecondsToNsPerOp(managedElapsed, iterations);

    samples.push({
      order: controlFirst ? "control-first" : "managed-first",

      controlNs,

      managedNs,

      deltaNs: managedNs - controlNs,

      deltaPercent: (managedNs / controlNs - 1) * 100,
    });
  }

  const controlValues = samples.map((sample) => sample.controlNs);

  const managedValues = samples.map((sample) => sample.managedNs);

  const deltaValues = samples.map((sample) => sample.deltaNs);

  const deltaPercentValues = samples.map((sample) => sample.deltaPercent);

  const controlFirstValues = samples
    .filter((sample) => sample.order === "control-first")
    .map((sample) => sample.deltaPercent);

  const managedFirstValues = samples
    .filter((sample) => sample.order === "managed-first")
    .map((sample) => sample.deltaPercent);

  const result: PairResult = {
    pair,

    controlMedianNs: median(controlValues),

    managedMedianNs: median(managedValues),

    pairedMedianDeltaNs: median(deltaValues),

    pairedMedianDeltaPercent: median(deltaPercentValues),

    controlCv: coefficientOfVariation(controlValues),

    managedCv: coefficientOfVariation(managedValues),

    managedWins: samples.filter((sample) => sample.managedNs < sample.controlNs)
      .length,

    controlFirstDeltaPercent: median(controlFirstValues),

    managedFirstDeltaPercent: median(managedFirstValues),
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

function createPair(pair: PairName): PairDefinition {
  switch (pair) {
    case "raw-bypass":
      return createRawBypassPair();

    case "json":
      return createJsonPair();

    case "text":
      return createTextPair();

    case "validate-auto":
      return createValidateAutoPair();

    case "validate-json":
      return createValidateJsonPair();

    case "reply-status":
      return createReplyStatusPair();
  }
}

function createRawBypassPair(): PairDefinition {
  let validations = 0;

  const Schema = createSchema<typeof PAYLOAD>((value) => {
    validations++;

    return {
      value: value as typeof PAYLOAD,
    };
  });

  const controlApp = new Gelis();

  controlApp.get(
    "/bench",

    () => RAW_RESPONSE,
  );

  const managedApp = new Gelis();

  managedApp.get(
    "/bench",

    {
      responses: {
        200: {
          schema: Schema,

          validate: true,
        },
      },
    },

    () => RAW_RESPONSE,
  );

  const control = createFetchOperation(controlApp);

  const managed = createFetchOperation(managedApp);

  const managedOperation = () => {
    const result = managed();

    if (validations !== 0) {
      throw new Error("Raw Response entered response validation");
    }

    return result;
  };

  return {
    control,

    managed: managedOperation,

    expectedStatus: 204,

    expectedBody: "",

    expectedContentType: null,

    rawIdentity: true,
  };
}

function createJsonPair(): PairDefinition {
  const Schema = createSchema<typeof PAYLOAD>();

  const controlApp = new Gelis();

  controlApp.get(
    "/bench",

    () => Response.json(PAYLOAD, JSON_INIT),
  );

  const managedApp = new Gelis();

  managedApp.get(
    "/bench",

    {
      responses: {
        200: {
          schema: Schema,

          serialize: "json",
        },
      },
    },

    () => PAYLOAD,
  );

  return {
    control: createFetchOperation(controlApp),

    managed: createFetchOperation(managedApp),

    expectedStatus: 200,

    expectedBody: JSON.stringify(PAYLOAD),

    expectedContentType: JSON_CONTENT_TYPE,
  };
}

function createTextPair(): PairDefinition {
  const Schema = createSchema<string>();

  const controlApp = new Gelis();

  controlApp.get(
    "/bench",

    () => new Response(TEXT, TEXT_INIT),
  );

  const managedApp = new Gelis();

  managedApp.get(
    "/bench",

    {
      responses: {
        200: {
          schema: Schema,

          serialize: "text",
        },
      },
    },

    () => TEXT,
  );

  return {
    control: createFetchOperation(controlApp),

    managed: createFetchOperation(managedApp),

    expectedStatus: 200,

    expectedBody: TEXT,

    expectedContentType: "text/plain; charset=utf-8",
  };
}

function createValidateAutoPair(): PairDefinition {
  const Schema = createSchema<
    typeof VALIDATION_INPUT,
    typeof VALIDATED_PAYLOAD
  >(validatePayload);

  const controlApp = new Gelis();

  controlApp.get(
    "/bench",

    () => {
      const result = validatePayload(VALIDATION_INPUT);

      if (result.issues !== undefined) {
        throw new Error("Unexpected validation issues");
      }

      return Response.json(result.value, JSON_INIT);
    },
  );

  const managedApp = new Gelis();

  managedApp.get(
    "/bench",

    {
      responses: {
        200: {
          schema: Schema,

          validate: true,
        },
      },
    },

    () => VALIDATION_INPUT,
  );

  return {
    control: createFetchOperation(controlApp),

    managed: createFetchOperation(managedApp),

    expectedStatus: 200,

    expectedBody: JSON.stringify(VALIDATED_PAYLOAD),

    expectedContentType: JSON_CONTENT_TYPE,
  };
}

function createValidateJsonPair(): PairDefinition {
  const Schema = createSchema<
    typeof VALIDATION_INPUT,
    typeof VALIDATED_PAYLOAD
  >(validatePayload);

  const controlApp = new Gelis();

  controlApp.get(
    "/bench",

    () => {
      const result = validatePayload(VALIDATION_INPUT);

      if (result.issues !== undefined) {
        throw new Error("Unexpected validation issues");
      }

      return Response.json(result.value, JSON_INIT);
    },
  );

  const managedApp = new Gelis();

  managedApp.get(
    "/bench",

    {
      responses: {
        200: {
          schema: Schema,

          validate: true,

          serialize: "json",
        },
      },
    },

    () => VALIDATION_INPUT,
  );

  return {
    control: createFetchOperation(controlApp),

    managed: createFetchOperation(managedApp),

    expectedStatus: 200,

    expectedBody: JSON.stringify(VALIDATED_PAYLOAD),

    expectedContentType: JSON_CONTENT_TYPE,
  };
}

function createReplyStatusPair(): PairDefinition {
  const Schema = createSchema<typeof PAYLOAD>();

  const controlApp = new Gelis();

  controlApp.get(
    "/bench",

    {
      responses: {
        201: Schema,
      },
    },

    ({ reply }) => reply.status(201, PAYLOAD),
  );

  const managedApp = new Gelis();

  managedApp.get(
    "/bench",

    {
      responses: {
        201: {
          schema: Schema,

          serialize: "json",
        },
      },
    },

    ({ reply }) => reply.status(201, PAYLOAD),
  );

  return {
    control: createFetchOperation(controlApp),

    managed: createFetchOperation(managedApp),

    expectedStatus: 201,

    expectedBody: JSON.stringify(PAYLOAD),

    expectedContentType: JSON_CONTENT_TYPE,
  };
}

function createFetchOperation(app: Gelis): PairOperation {
  return () => app.fetch(REQUEST) as Response;
}

function validatePayload(
  _value: unknown,
): StandardSchemaV1.Result<typeof VALIDATED_PAYLOAD> {
  return VALIDATION_RESULT;
}

function warmup(
  operation: PairOperation,

  iterations: number,
): void {
  for (let index = 0; index < iterations; index++) {
    sink = operation();
  }
}

function calibratePair(
  control: PairOperation,

  managed: PairOperation,
): number {
  let iterations = 1000;

  while (true) {
    const controlElapsed = measure(control, iterations);

    const managedElapsed = measure(managed, iterations);

    const slowerElapsed = Math.max(controlElapsed, managedElapsed);

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
  operation: PairOperation,

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

function readPair(): PairName | undefined {
  const prefix = "--pair=";

  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (argument === undefined) {
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

      vendor: "gelis-response-bench",

      validate,
    },
  } as StandardSchemaV1<Input, Output>;
}

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

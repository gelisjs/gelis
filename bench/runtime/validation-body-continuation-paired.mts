import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bodySyncSchema } from "../http/validation/schemas.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-body-continuation-paired.mts");

const SAMPLES = 41;
const BATCH_SIZE = 8_192;
const ROUNDS_PER_SAMPLE = 8;
const WARMUP_SIZE = 4_096;

const scenarios = ["valid-small", "valid-medium", "malformed-small"] as const;

type Scenario = (typeof scenarios)[number];

interface PairSample {
  readonly sample: number;
  readonly order: "then-first" | "await-first";
  readonly thenNs: number;
  readonly awaitNs: number;
  readonly deltaNs: number;
  readonly deltaPercent: number;
}

interface ScenarioResult {
  readonly scenario: Scenario;
  readonly operationsPerSide: number;
  readonly thenMedianNs: number;
  readonly awaitMedianNs: number;
  readonly pairedMedianDeltaNs: number;
  readonly pairedMedianDeltaPercent: number;
  readonly thenCv: number;
  readonly awaitCv: number;
  readonly awaitWins: number;
  readonly thenWins: number;
  readonly ties: number;
  readonly thenFirstMedianDeltaPercent: number;
  readonly awaitFirstMedianDeltaPercent: number;
  readonly samples: readonly PairSample[];
}

const SMALL_BODY = JSON.stringify({
  name: "gelis",
  count: 42,
});

const MEDIUM_BODY = JSON.stringify({
  name: "gelis",
  count: 42,
  padding: "x".repeat(1024),
});

const MALFORMED_BODY = '{"name":"gelis","count":';

let sink = 0;

const requestedScenario = readScenario();

if (requestedScenario !== undefined) {
  await runChild(requestedScenario);
} else {
  await verifyCorrectness();
  await runParent();
}

async function runParent(): Promise<void> {
  console.log(
    "Correctness: .then and async/await body continuations match PASS\n",
  );

  console.log("Gelis P7-D3 body continuation paired benchmark");
  console.log(`Runtime:     bun ${Bun.version}`);
  console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`Samples:     ${SAMPLES}`);
  console.log(`Batch size:  ${BATCH_SIZE} fresh Request objects/round`);
  console.log(`Rounds:      ${ROUNDS_PER_SAMPLE}/side/sample`);
  console.log(
    `Measured:    ${BATCH_SIZE * ROUNDS_PER_SAMPLE} body consumptions/side/sample`,
  );
  console.log("Timer:       Bun.nanoseconds()");
  console.log("GC:          Bun.gc(true) before every timed side");
  console.log("Preparation: Request construction outside timed segments");
  console.log("Pairing:     .then / async-await same process");
  console.log("Order:       alternated every sample");
  console.log("Isolation:   fresh process per scenario\n");

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
      "then ns": round(result.thenMedianNs, 2),
      "await ns": round(result.awaitMedianNs, 2),
      "paired Δ ns": round(result.pairedMedianDeltaNs, 2),
      "paired Δ %": round(result.pairedMedianDeltaPercent, 2),
      "then CV %": round(result.thenCv * 100, 2),
      "await CV %": round(result.awaitCv * 100, 2),
      "await faster": `${result.awaitWins}/${SAMPLES}`,
    })),
  );

  console.log("\nOrder-bias check\n");

  console.table(
    results.map((result) => ({
      scenario: result.scenario,
      "then-first Δ %": round(result.thenFirstMedianDeltaPercent, 2),
      "await-first Δ %": round(result.awaitFirstMedianDeltaPercent, 2),
    })),
  );

  console.log("\nInterpretation: negative delta favors async/await.");
  console.log(
    "Primary gate (valid-small): async/await must improve by >5 ns and >3%, both order halves negative, and both CVs <=5%.",
  );
  console.log(
    "Safety gate (valid-medium, malformed-small): no regression >5 ns and >3% with both order halves positive.",
  );
  console.log(
    "This benchmark isolates body parse + sync Standard Schema continuation shape; it is not a full Gelis fetch benchmark.",
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
      [`Body continuation benchmark failed: ${scenario}`, stdout, stderr].join(
        "\n",
      ),
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
  const body = bodyForScenario(scenario);

  await warmup(body);

  const samples: PairSample[] = [];
  const operationsPerSide = BATCH_SIZE * ROUNDS_PER_SAMPLE;

  for (let sample = 0; sample < SAMPLES; sample++) {
    const thenFirst = sample % 2 === 0;

    let thenElapsed = 0;
    let awaitElapsed = 0;

    for (let round = 0; round < ROUNDS_PER_SAMPLE; round++) {
      if (thenFirst) {
        thenElapsed += await measureSide(body, runThenPipeline);

        awaitElapsed += await measureSide(body, runAwaitPipeline);
      } else {
        awaitElapsed += await measureSide(body, runAwaitPipeline);

        thenElapsed += await measureSide(body, runThenPipeline);
      }
    }

    const thenNs = thenElapsed / operationsPerSide;

    const awaitNs = awaitElapsed / operationsPerSide;

    const deltaNs = awaitNs - thenNs;

    const deltaPercent = (awaitNs / thenNs - 1) * 100;

    samples.push({
      sample: sample + 1,
      order: thenFirst ? "then-first" : "await-first",
      thenNs,
      awaitNs,
      deltaNs,
      deltaPercent,
    });
  }

  const thenValues = samples.map((sample) => sample.thenNs);

  const awaitValues = samples.map((sample) => sample.awaitNs);

  const deltaValues = samples.map((sample) => sample.deltaNs);

  const deltaPercentValues = samples.map((sample) => sample.deltaPercent);

  const thenFirstDeltas = samples
    .filter((sample) => sample.order === "then-first")
    .map((sample) => sample.deltaPercent);

  const awaitFirstDeltas = samples
    .filter((sample) => sample.order === "await-first")
    .map((sample) => sample.deltaPercent);

  let awaitWins = 0;
  let thenWins = 0;
  let ties = 0;

  for (const sample of samples) {
    if (sample.awaitNs < sample.thenNs) {
      awaitWins++;
    } else if (sample.awaitNs > sample.thenNs) {
      thenWins++;
    } else {
      ties++;
    }
  }

  const result: ScenarioResult = {
    scenario,
    operationsPerSide,
    thenMedianNs: median(thenValues),
    awaitMedianNs: median(awaitValues),
    pairedMedianDeltaNs: median(deltaValues),
    pairedMedianDeltaPercent: median(deltaPercentValues),
    thenCv: coefficientOfVariation(thenValues),
    awaitCv: coefficientOfVariation(awaitValues),
    awaitWins,
    thenWins,
    ties,
    thenFirstMedianDeltaPercent: median(thenFirstDeltas),
    awaitFirstMedianDeltaPercent: median(awaitFirstDeltas),
    samples,
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

async function measureSide(
  body: string,
  pipeline: (request: Request) => Promise<number>,
): Promise<number> {
  const requests = createRequests(body, BATCH_SIZE);

  /*
   * Request construction is intentionally excluded.
   * A synchronous full GC is also excluded from timing.
   */
  Bun.gc(true);
  await Promise.resolve();

  const start = Bun.nanoseconds();

  for (let index = 0; index < requests.length; index++) {
    const request = requests[index];

    if (request === undefined) {
      throw new Error("Missing body continuation request");
    }

    sink = await pipeline(request);
  }

  return Bun.nanoseconds() - start;
}

function runThenPipeline(request: Request): Promise<number> {
  return request.json().then(
    (rawBody) => {
      const validation = bodySyncSchema["~standard"].validate(rawBody);

      if (isPromiseLike(validation)) {
        return Promise.resolve(validation).then((result) =>
          result.issues === undefined ? 1 : 422,
        );
      }

      return validation.issues === undefined ? 1 : 422;
    },
    () => 400,
  );
}

async function runAwaitPipeline(request: Request): Promise<number> {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return 400;
  }

  const validation = bodySyncSchema["~standard"].validate(rawBody);

  if (isPromiseLike(validation)) {
    const result = await validation;

    return result.issues === undefined ? 1 : 422;
  }

  return validation.issues === undefined ? 1 : 422;
}

function createRequests(body: string, count: number): Request[] {
  const requests = new Array<Request>(count);

  for (let index = 0; index < count; index++) {
    requests[index] = new Request("http://gelis.test/body", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body,
    });
  }

  return requests;
}

async function warmup(body: string): Promise<void> {
  const thenRequests = createRequests(body, WARMUP_SIZE);

  for (let index = 0; index < thenRequests.length; index++) {
    const request = thenRequests[index];

    if (request === undefined) {
      throw new Error("Missing .then warmup request");
    }

    sink = await runThenPipeline(request);
  }

  const awaitRequests = createRequests(body, WARMUP_SIZE);

  for (let index = 0; index < awaitRequests.length; index++) {
    const request = awaitRequests[index];

    if (request === undefined) {
      throw new Error("Missing async/await warmup request");
    }

    sink = await runAwaitPipeline(request);
  }

  Bun.gc(true);
}

async function verifyCorrectness(): Promise<void> {
  for (const scenario of scenarios) {
    const body = bodyForScenario(scenario);

    const thenRequest = createRequests(body, 1)[0];

    const awaitRequest = createRequests(body, 1)[0];

    if (thenRequest === undefined || awaitRequest === undefined) {
      throw new Error(`Missing correctness request: ${scenario}`);
    }

    const thenResult = await runThenPipeline(thenRequest);

    const awaitResult = await runAwaitPipeline(awaitRequest);

    if (thenResult !== awaitResult) {
      throw new Error(`Continuation semantics mismatch: ${scenario}`);
    }

    const expected = scenario === "malformed-small" ? 400 : 1;

    if (thenResult !== expected) {
      throw new Error(`Unexpected body continuation result: ${scenario}`);
    }
  }
}

function bodyForScenario(scenario: Scenario): string {
  switch (scenario) {
    case "valid-small":
      return SMALL_BODY;

    case "valid-medium":
      return MEDIUM_BODY;

    case "malformed-small":
      return MALFORMED_BODY;
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
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
    typeof candidate.operationsPerSide === "number" &&
    typeof candidate.thenMedianNs === "number" &&
    typeof candidate.awaitMedianNs === "number" &&
    typeof candidate.pairedMedianDeltaNs === "number" &&
    typeof candidate.pairedMedianDeltaPercent === "number" &&
    typeof candidate.thenCv === "number" &&
    typeof candidate.awaitCv === "number" &&
    typeof candidate.awaitWins === "number" &&
    typeof candidate.thenWins === "number" &&
    typeof candidate.ties === "number" &&
    typeof candidate.thenFirstMedianDeltaPercent === "number" &&
    typeof candidate.awaitFirstMedianDeltaPercent === "number" &&
    Array.isArray(candidate.samples)
  );
}

import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Gelis } from "../../src";
import {
  isJsonContentType,
  malformedJsonResponse,
  unsupportedMediaTypeResponse,
  validationErrorResponse,
} from "../../src/runtime/input.ts";
import { bodySyncSchema } from "../http/validation/schemas.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-body-framework-overhead-paired.mts");

const SAMPLES = 41;
const BATCH_SIZE = 4_096;
const ROUNDS_PER_SAMPLE = 8;
const WARMUP_SIZE = 2_048;

const scenarios = [
  "valid-small",
  "valid-medium",
  "malformed-small",
  "unsupported-media",
] as const;

type Scenario = (typeof scenarios)[number];

interface PairSample {
  readonly sample: number;
  readonly order: "control-first" | "gelis-first";
  readonly controlNs: number;
  readonly gelisNs: number;
  readonly deltaNs: number;
  readonly deltaPercent: number;
}

interface ScenarioResult {
  readonly scenario: Scenario;
  readonly operationsPerSide: number;
  readonly controlMedianNs: number;
  readonly gelisMedianNs: number;
  readonly pairedMedianDeltaNs: number;
  readonly pairedMedianDeltaPercent: number;
  readonly controlCv: number;
  readonly gelisCv: number;
  readonly controlFaster: number;
  readonly gelisFaster: number;
  readonly ties: number;
  readonly controlFirstMedianDeltaPercent: number;
  readonly gelisFirstMedianDeltaPercent: number;
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

let sink: unknown;

const requestedScenario = readScenario();

if (requestedScenario !== undefined) {
  await runChild(requestedScenario);
} else {
  await verifyCorrectness();
  await runParent();
}

async function runParent(): Promise<void> {
  console.log(
    "Correctness: direct semantic control matches Gelis body outcomes PASS\n",
  );

  console.log("Gelis P7-D4 body framework-overhead paired diagnostic");
  console.log(`Runtime:     bun ${Bun.version}`);
  console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`Samples:     ${SAMPLES}`);
  console.log(`Batch size:  ${BATCH_SIZE} fresh Request objects/round`);
  console.log(`Rounds:      ${ROUNDS_PER_SAMPLE}/side/sample`);
  console.log(
    `Measured:    ${BATCH_SIZE * ROUNDS_PER_SAMPLE} requests/side/sample`,
  );
  console.log("Timer:       Bun.nanoseconds()");
  console.log("GC:          Bun.gc(true) before every timed side");
  console.log("Preparation: Request construction outside timed segments");
  console.log("Pairing:     direct semantic control / Gelis app.fetch");
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
      "control ns": round(result.controlMedianNs, 2),
      "gelis ns": round(result.gelisMedianNs, 2),
      "paired Δ ns": round(result.pairedMedianDeltaNs, 2),
      "paired Δ %": round(result.pairedMedianDeltaPercent, 2),
      "control CV %": round(result.controlCv * 100, 2),
      "gelis CV %": round(result.gelisCv * 100, 2),
      "control faster": `${result.controlFaster}/${SAMPLES}`,
    })),
  );

  console.log("\nOrder-bias check\n");

  console.table(
    results.map((result) => ({
      scenario: result.scenario,
      "control-first Δ %": round(result.controlFirstMedianDeltaPercent, 2),
      "gelis-first Δ %": round(result.gelisFirstMedianDeltaPercent, 2),
    })),
  );

  console.log(
    "\nInterpretation: positive delta means Gelis is slower than the direct semantic control.",
  );
  console.log(
    "This is diagnostic only. The delta includes pathname extraction, routing, route/input dispatch, context creation, and handler invocation.",
  );
  console.log(
    "Do not attribute the full delta specifically to validation or body parsing.",
  );
  console.log("CV <=3% strong; 3-5% caution; >5% requires confirmation.");

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
      [
        `Body framework-overhead diagnostic failed: ${scenario}`,
        stdout,
        stderr,
      ].join("\n"),
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
  const app = createBodyApp();

  await warmupScenario(app, scenario);

  const samples: PairSample[] = [];
  const operationsPerSide = BATCH_SIZE * ROUNDS_PER_SAMPLE;

  for (let sample = 0; sample < SAMPLES; sample++) {
    const controlFirst = sample % 2 === 0;

    let controlElapsed = 0;
    let gelisElapsed = 0;

    for (let round = 0; round < ROUNDS_PER_SAMPLE; round++) {
      if (controlFirst) {
        controlElapsed += await measureSide(scenario, runDirectBodyRoute);

        gelisElapsed += await measureSide(scenario, (request) =>
          app.fetch(request),
        );
      } else {
        gelisElapsed += await measureSide(scenario, (request) =>
          app.fetch(request),
        );

        controlElapsed += await measureSide(scenario, runDirectBodyRoute);
      }
    }

    const controlNs = controlElapsed / operationsPerSide;

    const gelisNs = gelisElapsed / operationsPerSide;

    const deltaNs = gelisNs - controlNs;

    const deltaPercent = (gelisNs / controlNs - 1) * 100;

    samples.push({
      sample: sample + 1,
      order: controlFirst ? "control-first" : "gelis-first",
      controlNs,
      gelisNs,
      deltaNs,
      deltaPercent,
    });
  }

  const controlValues = samples.map((sample) => sample.controlNs);

  const gelisValues = samples.map((sample) => sample.gelisNs);

  const deltaValues = samples.map((sample) => sample.deltaNs);

  const deltaPercentValues = samples.map((sample) => sample.deltaPercent);

  const controlFirstDeltas = samples
    .filter((sample) => sample.order === "control-first")
    .map((sample) => sample.deltaPercent);

  const gelisFirstDeltas = samples
    .filter((sample) => sample.order === "gelis-first")
    .map((sample) => sample.deltaPercent);

  let controlFaster = 0;
  let gelisFaster = 0;
  let ties = 0;

  for (const sample of samples) {
    if (sample.controlNs < sample.gelisNs) {
      controlFaster++;
    } else if (sample.gelisNs < sample.controlNs) {
      gelisFaster++;
    } else {
      ties++;
    }
  }

  const result: ScenarioResult = {
    scenario,
    operationsPerSide,
    controlMedianNs: median(controlValues),
    gelisMedianNs: median(gelisValues),
    pairedMedianDeltaNs: median(deltaValues),
    pairedMedianDeltaPercent: median(deltaPercentValues),
    controlCv: coefficientOfVariation(controlValues),
    gelisCv: coefficientOfVariation(gelisValues),
    controlFaster,
    gelisFaster,
    ties,
    controlFirstMedianDeltaPercent: median(controlFirstDeltas),
    gelisFirstMedianDeltaPercent: median(gelisFirstDeltas),
    samples,
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

async function measureSide(
  scenario: Scenario,
  operation: (request: Request) => Response | Promise<Response>,
): Promise<number> {
  const requests = createRequests(scenario, BATCH_SIZE);

  Bun.gc(true);
  await Promise.resolve();

  const start = Bun.nanoseconds();

  for (let index = 0; index < requests.length; index++) {
    const request = requests[index];

    if (request === undefined) {
      throw new Error("Missing body framework-overhead request");
    }

    sink = await operation(request);
  }

  return Bun.nanoseconds() - start;
}

function runDirectBodyRoute(request: Request): Response | Promise<Response> {
  if (!isJsonContentType(request)) {
    return unsupportedMediaTypeResponse();
  }

  return request.json().then(
    (rawBody) => {
      const validation = bodySyncSchema["~standard"].validate(rawBody);

      if (isPromiseLike(validation)) {
        return Promise.resolve(validation).then((result) => {
          if (result.issues !== undefined) {
            return validationErrorResponse("body", result.issues);
          }

          return new Response("ok");
        });
      }

      if (validation.issues !== undefined) {
        return validationErrorResponse("body", validation.issues);
      }

      return new Response("ok");
    },

    () => malformedJsonResponse(),
  );
}

function createBodyApp(): Gelis {
  const app = new Gelis();

  app.post(
    "/body",
    {
      body: bodySyncSchema,
    },
    () => new Response("ok"),
  );

  return app;
}

function createRequests(scenario: Scenario, count: number): Request[] {
  const requests = new Array<Request>(count);

  const body =
    scenario === "valid-medium"
      ? MEDIUM_BODY
      : scenario === "malformed-small"
        ? MALFORMED_BODY
        : SMALL_BODY;

  const contentType =
    scenario === "unsupported-media" ? "text/plain" : "application/json";

  for (let index = 0; index < count; index++) {
    requests[index] = new Request("http://gelis.test/body", {
      method: "POST",
      headers: {
        "content-type": contentType,
      },
      body,
    });
  }

  return requests;
}

async function warmupScenario(app: Gelis, scenario: Scenario): Promise<void> {
  const controlRequests = createRequests(scenario, WARMUP_SIZE);

  for (let index = 0; index < controlRequests.length; index++) {
    const request = controlRequests[index];

    if (request === undefined) {
      throw new Error("Missing direct-control warmup request");
    }

    sink = await runDirectBodyRoute(request);
  }

  const gelisRequests = createRequests(scenario, WARMUP_SIZE);

  for (let index = 0; index < gelisRequests.length; index++) {
    const request = gelisRequests[index];

    if (request === undefined) {
      throw new Error("Missing Gelis warmup request");
    }

    sink = await app.fetch(request);
  }

  Bun.gc(true);
}

async function verifyCorrectness(): Promise<void> {
  const app = createBodyApp();

  for (const scenario of scenarios) {
    const directRequest = createRequests(scenario, 1)[0];

    const gelisRequest = createRequests(scenario, 1)[0];

    if (directRequest === undefined || gelisRequest === undefined) {
      throw new Error(`Missing correctness request: ${scenario}`);
    }

    const direct = await runDirectBodyRoute(directRequest);

    const gelis = await app.fetch(gelisRequest);

    if (direct.status !== gelis.status) {
      throw new Error(
        `Status mismatch for ${scenario}: direct=${direct.status}, gelis=${gelis.status}`,
      );
    }

    const directText = await direct.text();

    const gelisText = await gelis.text();

    if (directText !== gelisText) {
      throw new Error(`Body mismatch for ${scenario}`);
    }
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
    typeof candidate.controlMedianNs === "number" &&
    typeof candidate.gelisMedianNs === "number" &&
    typeof candidate.pairedMedianDeltaNs === "number" &&
    typeof candidate.pairedMedianDeltaPercent === "number" &&
    typeof candidate.controlCv === "number" &&
    typeof candidate.gelisCv === "number" &&
    typeof candidate.controlFaster === "number" &&
    typeof candidate.gelisFaster === "number" &&
    typeof candidate.ties === "number" &&
    typeof candidate.controlFirstMedianDeltaPercent === "number" &&
    typeof candidate.gelisFirstMedianDeltaPercent === "number" &&
    Array.isArray(candidate.samples)
  );
}

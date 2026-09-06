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
const CHILD = resolve(HERE, "validation-body-native-vs-manual-paired.mts");

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
  readonly order: "manual-first" | "native-first";
  readonly manualNs: number;
  readonly nativeNs: number;
  readonly deltaNs: number;
  readonly deltaPercent: number;
}

interface ScenarioResult {
  readonly scenario: Scenario;
  readonly operationsPerSide: number;
  readonly manualMedianNs: number;
  readonly nativeMedianNs: number;
  readonly pairedMedianDeltaNs: number;
  readonly pairedMedianDeltaPercent: number;
  readonly manualCv: number;
  readonly nativeCv: number;
  readonly manualFaster: number;
  readonly nativeFaster: number;
  readonly ties: number;
  readonly manualFirstMedianDeltaPercent: number;
  readonly nativeFirstMedianDeltaPercent: number;
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
    "Correctness: manual-in-handler and native validation outcomes match PASS\n",
  );

  console.log(
    "Gelis P7-D5 native validation vs manual-in-handler paired diagnostic",
  );
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
  console.log("Pairing:     Gelis manual route / Gelis native validation");
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
      "manual ns": round(result.manualMedianNs, 2),
      "native ns": round(result.nativeMedianNs, 2),
      "paired Δ ns": round(result.pairedMedianDeltaNs, 2),
      "paired Δ %": round(result.pairedMedianDeltaPercent, 2),
      "manual CV %": round(result.manualCv * 100, 2),
      "native CV %": round(result.nativeCv * 100, 2),
      "manual faster": `${result.manualFaster}/${SAMPLES}`,
    })),
  );

  console.log("\nOrder-bias check\n");

  console.table(
    results.map((result) => ({
      scenario: result.scenario,
      "manual-first Δ %": round(result.manualFirstMedianDeltaPercent, 2),
      "native-first Δ %": round(result.nativeFirstMedianDeltaPercent, 2),
    })),
  );

  console.log(
    "\nInterpretation: positive delta means native validation is slower than manual validation inside a Gelis handler.",
  );
  console.log("Primary diagnostic anchor: valid-small.");
  console.log(
    "Materiality heuristic: >=15% material; 5-15% secondary; <5% low, subject to max(5 ns, 3%) noise threshold.",
  );
  console.log(
    "Both order halves should agree before treating a delta as directional evidence.",
  );
  console.log("CV <=3% strong; 3-5% caution; >5% requires confirmation.");
  console.log(
    "Do not attribute the complete delta to one individual function; route-plan differences remain non-additive.",
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
      [
        `Native-vs-manual body diagnostic failed: ${scenario}`,
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
  const manualApp = createManualApp();
  const nativeApp = createNativeApp();

  await warmupScenario(manualApp, nativeApp, scenario);

  const samples: PairSample[] = [];
  const operationsPerSide = BATCH_SIZE * ROUNDS_PER_SAMPLE;

  for (let sample = 0; sample < SAMPLES; sample++) {
    const manualFirst = sample % 2 === 0;

    let manualElapsed = 0;
    let nativeElapsed = 0;

    for (let round = 0; round < ROUNDS_PER_SAMPLE; round++) {
      if (manualFirst) {
        manualElapsed += await measureAppSide(manualApp, scenario);

        nativeElapsed += await measureAppSide(nativeApp, scenario);
      } else {
        nativeElapsed += await measureAppSide(nativeApp, scenario);

        manualElapsed += await measureAppSide(manualApp, scenario);
      }
    }

    const manualNs = manualElapsed / operationsPerSide;

    const nativeNs = nativeElapsed / operationsPerSide;

    const deltaNs = nativeNs - manualNs;

    const deltaPercent = (nativeNs / manualNs - 1) * 100;

    samples.push({
      sample: sample + 1,
      order: manualFirst ? "manual-first" : "native-first",
      manualNs,
      nativeNs,
      deltaNs,
      deltaPercent,
    });
  }

  const manualValues = samples.map((sample) => sample.manualNs);

  const nativeValues = samples.map((sample) => sample.nativeNs);

  const deltaValues = samples.map((sample) => sample.deltaNs);

  const deltaPercentValues = samples.map((sample) => sample.deltaPercent);

  const manualFirstDeltas = samples
    .filter((sample) => sample.order === "manual-first")
    .map((sample) => sample.deltaPercent);

  const nativeFirstDeltas = samples
    .filter((sample) => sample.order === "native-first")
    .map((sample) => sample.deltaPercent);

  let manualFaster = 0;
  let nativeFaster = 0;
  let ties = 0;

  for (const sample of samples) {
    if (sample.manualNs < sample.nativeNs) {
      manualFaster++;
    } else if (sample.nativeNs < sample.manualNs) {
      nativeFaster++;
    } else {
      ties++;
    }
  }

  const result: ScenarioResult = {
    scenario,
    operationsPerSide,
    manualMedianNs: median(manualValues),
    nativeMedianNs: median(nativeValues),
    pairedMedianDeltaNs: median(deltaValues),
    pairedMedianDeltaPercent: median(deltaPercentValues),
    manualCv: coefficientOfVariation(manualValues),
    nativeCv: coefficientOfVariation(nativeValues),
    manualFaster,
    nativeFaster,
    ties,
    manualFirstMedianDeltaPercent: median(manualFirstDeltas),
    nativeFirstMedianDeltaPercent: median(nativeFirstDeltas),
    samples,
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

async function measureAppSide(app: Gelis, scenario: Scenario): Promise<number> {
  const requests = createRequests(scenario, BATCH_SIZE);

  Bun.gc(true);
  await Promise.resolve();

  const start = Bun.nanoseconds();

  for (let index = 0; index < requests.length; index++) {
    const request = requests[index];

    if (request === undefined) {
      throw new Error("Missing native-vs-manual benchmark request");
    }

    sink = await app.fetch(request);
  }

  return Bun.nanoseconds() - start;
}

function createManualApp(): Gelis {
  const app = new Gelis();

  app.post("/body", ({ request }) => runManualBodyValidation(request));

  return app;
}

function createNativeApp(): Gelis {
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

function runManualBodyValidation(
  request: Request,
): Response | Promise<Response> {
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

async function warmupScenario(
  manualApp: Gelis,
  nativeApp: Gelis,
  scenario: Scenario,
): Promise<void> {
  const manualRequests = createRequests(scenario, WARMUP_SIZE);

  for (let index = 0; index < manualRequests.length; index++) {
    const request = manualRequests[index];

    if (request === undefined) {
      throw new Error("Missing manual warmup request");
    }

    sink = await manualApp.fetch(request);
  }

  const nativeRequests = createRequests(scenario, WARMUP_SIZE);

  for (let index = 0; index < nativeRequests.length; index++) {
    const request = nativeRequests[index];

    if (request === undefined) {
      throw new Error("Missing native warmup request");
    }

    sink = await nativeApp.fetch(request);
  }

  Bun.gc(true);
}

async function verifyCorrectness(): Promise<void> {
  const manualApp = createManualApp();
  const nativeApp = createNativeApp();

  for (const scenario of scenarios) {
    const manualRequest = createRequests(scenario, 1)[0];

    const nativeRequest = createRequests(scenario, 1)[0];

    if (manualRequest === undefined || nativeRequest === undefined) {
      throw new Error(`Missing correctness request: ${scenario}`);
    }

    const manual = await manualApp.fetch(manualRequest);

    const native = await nativeApp.fetch(nativeRequest);

    if (manual.status !== native.status) {
      throw new Error(
        `Status mismatch for ${scenario}: manual=${manual.status}, native=${native.status}`,
      );
    }

    const manualText = await manual.text();

    const nativeText = await native.text();

    if (manualText !== nativeText) {
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
    typeof candidate.manualMedianNs === "number" &&
    typeof candidate.nativeMedianNs === "number" &&
    typeof candidate.pairedMedianDeltaNs === "number" &&
    typeof candidate.pairedMedianDeltaPercent === "number" &&
    typeof candidate.manualCv === "number" &&
    typeof candidate.nativeCv === "number" &&
    typeof candidate.manualFaster === "number" &&
    typeof candidate.nativeFaster === "number" &&
    typeof candidate.ties === "number" &&
    typeof candidate.manualFirstMedianDeltaPercent === "number" &&
    typeof candidate.nativeFirstMedianDeltaPercent === "number" &&
    Array.isArray(candidate.samples)
  );
}

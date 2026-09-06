import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Gelis } from "../../src";
import { bodySyncSchema } from "../http/validation/schemas.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-body-baseline.mts");

const SAMPLES = 31;
const BATCH_SIZE = 16_384;
const WARMUP_SIZE = 2_048;

const scenarios = [
  "request-json-small",
  "body-fetch-small",
  "request-json-medium",
  "body-fetch-medium",
] as const;

type Scenario = (typeof scenarios)[number];

interface ScenarioResult {
  readonly scenario: Scenario;
  readonly batchSize: number;
  readonly medianNs: number;
  readonly minNs: number;
  readonly maxNs: number;
  readonly cv: number;
  readonly samples: readonly number[];
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

let sink: unknown;

const requestedScenario = readScenario();

if (requestedScenario !== undefined) {
  await runChild(requestedScenario);
} else {
  await verifyCorrectness();
  await runParent();
}

async function runParent(): Promise<void> {
  console.log("Correctness: body baseline workloads PASS\n");

  console.log("Gelis P7-D1 body-path stabilization baseline");
  console.log(`Runtime:     bun ${Bun.version}`);
  console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`Samples:     ${SAMPLES}`);
  console.log(`Batch size:  ${BATCH_SIZE} fresh Request objects/sample`);
  console.log("Preparation: Request construction outside timed section");
  console.log("Isolation:   fresh process per stage");
  console.log("Execution:   sequential body consumption\n");

  const results: ScenarioResult[] = [];

  for (let index = 0; index < scenarios.length; index++) {
    const scenario = scenarios[index];

    if (scenario === undefined) {
      continue;
    }

    console.log(`[${index + 1}/${scenarios.length}] ${scenario}`);
    results.push(await runIsolatedScenario(scenario));
  }

  console.log("\nResults\n");

  console.table(
    results.map((result) => ({
      stage: result.scenario,
      "ns/op median": round(result.medianNs, 2),
      "ns/op min": round(result.minNs, 2),
      "ns/op max": round(result.maxNs, 2),
      "cv %": round(result.cv * 100, 2),
      "batch size": result.batchSize,
    })),
  );

  console.log("\nInterpretation rules:");
  console.log("- request-json-* isolates Request.json() on prebuilt requests.");
  console.log(
    "- body-fetch-* is the production-like Gelis body-validation fetch anchor.",
  );
  console.log("- Do not subtract or sum stages as exact request cost.");
  console.log("- CV <=3% strong; 3-5% caution; >5% requires confirmation.");

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
      [`Body baseline failed: ${scenario}`, stdout, stderr].join("\n"),
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
  const body = scenario.endsWith("medium") ? MEDIUM_BODY : SMALL_BODY;

  const app = scenario.startsWith("body-fetch") ? createBodyApp() : undefined;

  await warmupScenario(scenario, body, app);

  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const requests = createRequests(body, BATCH_SIZE);

    /*
     * Give setup-created work a scheduling boundary before timing.
     * Request construction itself is intentionally excluded.
     */
    await Promise.resolve();

    const start = performance.now();

    if (scenario.startsWith("request-json")) {
      for (let index = 0; index < requests.length; index++) {
        const request = requests[index];

        if (request === undefined) {
          throw new Error("Missing Request.json benchmark request");
        }

        sink = await request.json();
      }
    } else {
      if (app === undefined) {
        throw new Error("Missing Gelis body benchmark app");
      }

      for (let index = 0; index < requests.length; index++) {
        const request = requests[index];

        if (request === undefined) {
          throw new Error("Missing body fetch benchmark request");
        }

        sink = await app.fetch(request);
      }
    }

    const elapsed = performance.now() - start;

    samples.push(millisecondsToNsPerOp(elapsed, requests.length));
  }

  const result: ScenarioResult = {
    scenario,
    batchSize: BATCH_SIZE,
    medianNs: median(samples),
    minNs: Math.min(...samples),
    maxNs: Math.max(...samples),
    cv: coefficientOfVariation(samples),
    samples,
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
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

async function warmupScenario(
  scenario: Scenario,
  body: string,
  app: Gelis | undefined,
): Promise<void> {
  const requests = createRequests(body, WARMUP_SIZE);

  if (scenario.startsWith("request-json")) {
    for (let index = 0; index < requests.length; index++) {
      const request = requests[index];

      if (request === undefined) {
        throw new Error("Missing Request.json warmup request");
      }

      sink = await request.json();
    }

    return;
  }

  if (app === undefined) {
    throw new Error("Missing Gelis body warmup app");
  }

  for (let index = 0; index < requests.length; index++) {
    const request = requests[index];

    if (request === undefined) {
      throw new Error("Missing body fetch warmup request");
    }

    sink = await app.fetch(request);
  }
}

async function verifyCorrectness(): Promise<void> {
  const smallRequest = createRequests(SMALL_BODY, 1)[0];

  if (smallRequest === undefined) {
    throw new Error("Missing small correctness request");
  }

  const small = await smallRequest.json();

  assertBodyShape(small, false);

  const mediumRequest = createRequests(MEDIUM_BODY, 1)[0];

  if (mediumRequest === undefined) {
    throw new Error("Missing medium correctness request");
  }

  const medium = await mediumRequest.json();

  assertBodyShape(medium, true);

  const app = createBodyApp();

  const response = await app.fetch(
    new Request("http://gelis.test/body", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: SMALL_BODY,
    }),
  );

  if (response.status !== 200) {
    throw new Error(`Unexpected body fetch status: ${response.status}`);
  }

  if ((await response.text()) !== "ok") {
    throw new Error("Unexpected body fetch response");
  }
}

function assertBodyShape(value: unknown, expectPadding: boolean): void {
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected parsed JSON object");
  }

  const body = value as Record<string, unknown>;

  if (body.name !== "gelis" || body.count !== 42) {
    throw new Error("Unexpected parsed JSON values");
  }

  if (
    expectPadding &&
    (typeof body.padding !== "string" || body.padding.length !== 1024)
  ) {
    throw new Error("Unexpected medium JSON padding");
  }
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
    typeof candidate.batchSize === "number" &&
    typeof candidate.medianNs === "number" &&
    typeof candidate.minNs === "number" &&
    typeof candidate.maxNs === "number" &&
    typeof candidate.cv === "number" &&
    Array.isArray(candidate.samples)
  );
}

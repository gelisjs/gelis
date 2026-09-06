import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-query-parser-decomposition.mts");

const URL_COUNT = 128;
const URL_MASK = URL_COUNT - 1;

const SAMPLES = 21;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 25;
const WARMUP_ITERATIONS = 100_000;

const scenarios = [
  "object-allocation",
  "boundary-lookup",
  "scan-only-basic",
  "materialize-basic",
  "full-basic",
  "scan-only-encoded",
  "materialize-encoded",
  "full-encoded",
  "scan-only-duplicates",
  "materialize-duplicates",
  "full-duplicates",
] as const;

type Scenario = (typeof scenarios)[number];

interface ScenarioResult {
  readonly scenario: Scenario;
  readonly iterations: number;
  readonly medianNs: number;
  readonly minNs: number;
  readonly maxNs: number;
  readonly cv: number;
  readonly samples: readonly number[];
}

type QueryResult = Record<string, string | string[]>;

let sink: unknown;

const requestedScenario = readScenario();

if (requestedScenario !== undefined) {
  runChild(requestedScenario);
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  console.log("\nGelis P7-B2 query parser internal cost decomposition");
  console.log(`Runtime:     bun ${Bun.version}`);
  console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`URLs:        ${URL_COUNT}`);
  console.log(`Samples:     ${SAMPLES}`);
  console.log(`Target:      ${TARGET_MS} ms/sample`);
  console.log("Isolation:   fresh process per stage");
  console.log("\nDo not sum isolated stage timings as exact parser cost.\n");

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
      iterations: result.iterations,
    })),
  );

  console.log(
    "\nInterpretation: use full-basic/full-encoded/full-duplicates as anchors.",
  );
  console.log(
    "Do not arithmetic-sum isolated stages. Use scan/materialize variants only to localize work.",
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
      [`Decomposition failed: ${scenario}`, stdout, stderr].join("\n"),
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

function runChild(scenario: Scenario): void {
  const urls = createUrlsForScenario(scenario);
  const operation = createOperation(scenario, urls);

  warmup(operation, WARMUP_ITERATIONS);

  const iterations = calibrate(operation);
  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const elapsed = measure(operation, iterations);

    samples.push(millisecondsToNsPerOp(elapsed, iterations));
  }

  const result: ScenarioResult = {
    scenario,
    iterations,
    medianNs: median(samples),
    minNs: Math.min(...samples),
    maxNs: Math.max(...samples),
    cv: coefficientOfVariation(samples),
    samples,
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

function createOperation(
  scenario: Scenario,
  urls: readonly string[],
): () => void {
  let cursor = 0;

  return () => {
    const url = urls[cursor];

    cursor = (cursor + 1) & URL_MASK;

    if (url === undefined) {
      throw new Error("Missing benchmark URL");
    }

    switch (scenario) {
      case "object-allocation":
        sink = createQueryResult();
        return;

      case "boundary-lookup":
        sink = findQueryBounds(url);
        return;

      case "scan-only-basic":
      case "scan-only-encoded":
      case "scan-only-duplicates":
        sink = scanQuery(url);
        return;

      case "materialize-basic":
      case "materialize-encoded":
      case "materialize-duplicates":
        sink = materializeQuery(url);
        return;

      case "full-basic":
      case "full-encoded":
      case "full-duplicates":
        sink = parseQueryFromUrlReplica(url);
        return;
    }
  };
}

function createUrlsForScenario(scenario: Scenario): string[] {
  if (scenario === "object-allocation") {
    return Array.from({ length: URL_COUNT }, () => "http://gelis.test/");
  }

  if (
    scenario === "boundary-lookup" ||
    scenario === "scan-only-basic" ||
    scenario === "materialize-basic" ||
    scenario === "full-basic"
  ) {
    return createUrls("basic");
  }

  if (
    scenario === "scan-only-encoded" ||
    scenario === "materialize-encoded" ||
    scenario === "full-encoded"
  ) {
    return createUrls("encoded");
  }

  return createUrls("duplicates");
}

function createUrls(scenario: "basic" | "encoded" | "duplicates"): string[] {
  const urls: string[] = [];

  for (let index = 0; index < URL_COUNT; index++) {
    switch (scenario) {
      case "basic":
        urls.push(
          [
            "http://gelis.test/r/4999",
            `?page=${40 + (index % 10)}`,
            `&q=gelis${index}`,
          ].join(""),
        );
        break;

      case "encoded":
        urls.push(
          [
            "http://gelis.test/r/4999",
            "?page=42",
            `&q=hello+world%20${index}`,
          ].join(""),
        );
        break;

      case "duplicates":
        urls.push(
          [
            "http://gelis.test/r/4999",
            "?tag=a",
            "&tag=b",
            "&page=42",
            `&q=gelis${index}`,
          ].join(""),
        );
        break;
    }
  }

  return urls;
}

function createQueryResult(): QueryResult {
  return Object.create(null) as QueryResult;
}

function findQueryBounds(url: string): number {
  const queryStart = url.indexOf("?");

  if (queryStart === -1) {
    return -1;
  }

  const hashStart = url.indexOf("#", queryStart + 1);
  const queryEnd = hashStart === -1 ? url.length : hashStart;

  return queryStart + queryEnd;
}

function scanQuery(url: string): number {
  const queryStart = url.indexOf("?");

  if (queryStart === -1) {
    return 0;
  }

  const hashStart = url.indexOf("#", queryStart + 1);
  const queryEnd = hashStart === -1 ? url.length : hashStart;

  let pairStart = queryStart + 1;

  if (pairStart >= queryEnd) {
    return 0;
  }

  let equals = -1;

  let keyHasPlus = false;
  let keyHasPercent = false;

  let valueHasPlus = false;
  let valueHasPercent = false;

  let checksum = 0;

  for (let index = pairStart; index <= queryEnd; index++) {
    const atEnd = index === queryEnd;

    if (!atEnd) {
      const code = url.charCodeAt(index);

      if (code === 61 && equals === -1) {
        equals = index;
        continue;
      }

      if (code === 43) {
        if (equals === -1) {
          keyHasPlus = true;
        } else {
          valueHasPlus = true;
        }

        continue;
      }

      if (code === 37) {
        if (equals === -1) {
          keyHasPercent = true;
        } else {
          valueHasPercent = true;
        }

        continue;
      }

      if (code !== 38) {
        continue;
      }
    }

    const pairEnd = index;

    if (pairEnd > pairStart) {
      const actualEquals = equals === -1 ? pairEnd : equals;
      const valueStart = actualEquals < pairEnd ? actualEquals + 1 : pairEnd;

      checksum +=
        pairStart +
        actualEquals +
        valueStart +
        pairEnd +
        Number(keyHasPlus) +
        Number(keyHasPercent) +
        Number(valueHasPlus) +
        Number(valueHasPercent);
    }

    pairStart = pairEnd + 1;

    equals = -1;

    keyHasPlus = false;
    keyHasPercent = false;

    valueHasPlus = false;
    valueHasPercent = false;
  }

  return checksum;
}

function materializeQuery(url: string): QueryResult {
  const result = createQueryResult();

  const queryStart = url.indexOf("?");

  if (queryStart === -1) {
    return result;
  }

  const hashStart = url.indexOf("#", queryStart + 1);
  const queryEnd = hashStart === -1 ? url.length : hashStart;

  let pairStart = queryStart + 1;

  if (pairStart >= queryEnd) {
    return result;
  }

  let equals = -1;

  for (let index = pairStart; index <= queryEnd; index++) {
    const atEnd = index === queryEnd;

    if (!atEnd) {
      const code = url.charCodeAt(index);

      if (code === 61 && equals === -1) {
        equals = index;
        continue;
      }

      if (code !== 38) {
        continue;
      }
    }

    const pairEnd = index;

    if (pairEnd > pairStart) {
      const actualEquals = equals === -1 ? pairEnd : equals;
      const valueStart = actualEquals < pairEnd ? actualEquals + 1 : pairEnd;

      const key = url.slice(pairStart, actualEquals);
      const value =
        actualEquals < pairEnd ? url.slice(valueStart, pairEnd) : "";

      const existing = result[key];

      if (existing === undefined) {
        result[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
    }

    pairStart = pairEnd + 1;
    equals = -1;
  }

  return result;
}

function parseQueryFromUrlReplica(url: string): QueryResult {
  const result = createQueryResult();

  const queryStart = url.indexOf("?");

  if (queryStart === -1) {
    return result;
  }

  const hashStart = url.indexOf("#", queryStart + 1);
  const queryEnd = hashStart === -1 ? url.length : hashStart;

  let pairStart = queryStart + 1;

  if (pairStart >= queryEnd) {
    return result;
  }

  let equals = -1;

  let keyHasPlus = false;
  let keyHasPercent = false;

  let valueHasPlus = false;
  let valueHasPercent = false;

  for (let index = pairStart; index <= queryEnd; index++) {
    const atEnd = index === queryEnd;

    if (!atEnd) {
      const code = url.charCodeAt(index);

      if (code === 61 && equals === -1) {
        equals = index;
        continue;
      }

      if (code === 43) {
        if (equals === -1) {
          keyHasPlus = true;
        } else {
          valueHasPlus = true;
        }

        continue;
      }

      if (code === 37) {
        if (equals === -1) {
          keyHasPercent = true;
        } else {
          valueHasPercent = true;
        }

        continue;
      }

      if (code !== 38) {
        continue;
      }
    }

    const pairEnd = index;

    if (pairEnd > pairStart) {
      const actualEquals = equals === -1 ? pairEnd : equals;
      const valueStart = actualEquals < pairEnd ? actualEquals + 1 : pairEnd;

      let key = url.slice(pairStart, actualEquals);

      if (keyHasPlus || keyHasPercent) {
        key = decodeKnownQueryComponent(key, keyHasPlus, keyHasPercent);
      }

      let value = actualEquals < pairEnd ? url.slice(valueStart, pairEnd) : "";

      if (valueHasPlus || valueHasPercent) {
        value = decodeKnownQueryComponent(value, valueHasPlus, valueHasPercent);
      }

      const existing = result[key];

      if (existing === undefined) {
        result[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
    }

    pairStart = pairEnd + 1;

    equals = -1;

    keyHasPlus = false;
    keyHasPercent = false;

    valueHasPlus = false;
    valueHasPercent = false;
  }

  return result;
}

function decodeKnownQueryComponent(
  value: string,
  hasPlus: boolean,
  hasPercent: boolean,
): string {
  if (hasPlus) {
    value = value.replace(/\+/g, " ");
  }

  if (hasPercent) {
    value = decodeURIComponent(value);
  }

  return value;
}

function warmup(operation: () => void, iterations: number): void {
  for (let index = 0; index < iterations; index++) {
    operation();
  }
}

function calibrate(operation: () => void): number {
  let iterations = 1000;

  while (true) {
    const elapsed = measure(operation, iterations);

    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
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
    typeof candidate.medianNs === "number" &&
    typeof candidate.minNs === "number" &&
    typeof candidate.maxNs === "number" &&
    typeof candidate.cv === "number" &&
    Array.isArray(candidate.samples)
  );
}

import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseQueryFromUrl } from "../../src/runtime/input.ts";
import { pathnameFromUrl } from "../../src/runtime/url.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-query-shared-start-paired.mts");

const URL_COUNT = 128;
const URL_MASK = URL_COUNT - 1;

const SAMPLES = 31;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 25;
const WARMUP_ITERATIONS = 100_000;

const scenarios = ["plain", "basic", "encoded", "duplicates", "wide"] as const;

type Scenario = (typeof scenarios)[number];
type QueryResult = Record<string, string | string[]>;

interface PipelineResult {
  readonly pathname: string;
  readonly query: QueryResult | undefined;
}

interface PairSample {
  readonly sample: number;
  readonly order: "current-first" | "shared-first";
  readonly currentNs: number;
  readonly sharedNs: number;
  readonly deltaNs: number;
  readonly deltaPercent: number;
}

interface ScenarioResult {
  readonly scenario: Scenario;
  readonly iterations: number;
  readonly currentMedianNs: number;
  readonly sharedMedianNs: number;
  readonly pairedMedianDeltaNs: number;
  readonly pairedMedianDeltaPercent: number;
  readonly currentCv: number;
  readonly sharedCv: number;
  readonly sharedWins: number;
  readonly currentWins: number;
  readonly ties: number;
  readonly currentFirstMedianDeltaPercent: number;
  readonly sharedFirstMedianDeltaPercent: number;
  readonly samples: readonly PairSample[];
}

let sinkPath: unknown;
let sinkQuery: unknown;

const requestedScenario = readScenario();

if (requestedScenario !== undefined) {
  runChild(requestedScenario);
} else {
  verifyCorrectness();
  await runParent();
}

async function runParent(): Promise<void> {
  console.log(
    "Correctness: shared query-start extraction matches current pipeline PASS\n",
  );

  console.log("Gelis P7-B9 shared query-start paired benchmark");
  console.log(`Runtime:     bun ${Bun.version}`);
  console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`URLs:        ${URL_COUNT}`);
  console.log(`Samples:     ${SAMPLES}`);
  console.log(`Target:      ${TARGET_MS} ms/side/sample`);
  console.log("URL source:  Bun Request.url");
  console.log("Isolation:   fresh process per workload");
  console.log("Pairing:     current/shared-start same process");
  console.log("Order:       alternated every sample");
  console.log("Current:     pathnameFromUrl(url) + parseQueryFromUrl(url)");
  console.log(
    "Candidate:   find queryStart once, reuse it for pathname + query parsing\n",
  );

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
      "shared ns": round(result.sharedMedianNs, 2),
      "paired Δ ns": round(result.pairedMedianDeltaNs, 2),
      "paired Δ %": round(result.pairedMedianDeltaPercent, 2),
      "current CV %": round(result.currentCv * 100, 2),
      "shared CV %": round(result.sharedCv * 100, 2),
      "shared faster": `${result.sharedWins}/${SAMPLES}`,
    })),
  );

  console.log("\nOrder-bias check\n");

  console.table(
    results.map((result) => ({
      scenario: result.scenario,
      "current-first Δ %": round(result.currentFirstMedianDeltaPercent, 2),
      "shared-first Δ %": round(result.sharedFirstMedianDeltaPercent, 2),
    })),
  );

  console.log("\nInterpretation: negative delta favors shared query-start.");
  console.log(
    "Primary validated gate: basic must improve by >5 ns and >3%, with both order halves negative.",
  );
  console.log(
    "Zero-unused gate: plain must not regress by >5 ns and >3% with both order halves positive.",
  );
  console.log(
    "Safety gate: encoded, duplicates, and wide must not regress by >5 ns and >3% with both order halves positive.",
  );

  void sinkPath;
  void sinkQuery;
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

function runChild(scenario: Scenario): void {
  const urls = createRuntimeUrls(scenario);

  const currentOperation = createCurrentOperation(urls, scenario !== "plain");

  const sharedOperation = createSharedOperation(urls, scenario !== "plain");

  warmup(currentOperation, WARMUP_ITERATIONS);
  warmup(sharedOperation, WARMUP_ITERATIONS);

  const iterations = calibratePair(currentOperation, sharedOperation);

  const samples: PairSample[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const currentFirst = sample % 2 === 0;

    let currentElapsed: number;
    let sharedElapsed: number;

    if (currentFirst) {
      currentElapsed = measure(currentOperation, iterations);
      sharedElapsed = measure(sharedOperation, iterations);
    } else {
      sharedElapsed = measure(sharedOperation, iterations);
      currentElapsed = measure(currentOperation, iterations);
    }

    const currentNs = millisecondsToNsPerOp(currentElapsed, iterations);

    const sharedNs = millisecondsToNsPerOp(sharedElapsed, iterations);

    const deltaNs = sharedNs - currentNs;
    const deltaPercent = (sharedNs / currentNs - 1) * 100;

    samples.push({
      sample: sample + 1,
      order: currentFirst ? "current-first" : "shared-first",
      currentNs,
      sharedNs,
      deltaNs,
      deltaPercent,
    });
  }

  const currentValues = samples.map((sample) => sample.currentNs);
  const sharedValues = samples.map((sample) => sample.sharedNs);
  const deltaValues = samples.map((sample) => sample.deltaNs);
  const deltaPercentValues = samples.map((sample) => sample.deltaPercent);

  const currentFirstDeltas = samples
    .filter((sample) => sample.order === "current-first")
    .map((sample) => sample.deltaPercent);

  const sharedFirstDeltas = samples
    .filter((sample) => sample.order === "shared-first")
    .map((sample) => sample.deltaPercent);

  let sharedWins = 0;
  let currentWins = 0;
  let ties = 0;

  for (const sample of samples) {
    if (sample.sharedNs < sample.currentNs) {
      sharedWins++;
    } else if (sample.sharedNs > sample.currentNs) {
      currentWins++;
    } else {
      ties++;
    }
  }

  const result: ScenarioResult = {
    scenario,
    iterations,
    currentMedianNs: median(currentValues),
    sharedMedianNs: median(sharedValues),
    pairedMedianDeltaNs: median(deltaValues),
    pairedMedianDeltaPercent: median(deltaPercentValues),
    currentCv: coefficientOfVariation(currentValues),
    sharedCv: coefficientOfVariation(sharedValues),
    sharedWins,
    currentWins,
    ties,
    currentFirstMedianDeltaPercent: median(currentFirstDeltas),
    sharedFirstMedianDeltaPercent: median(sharedFirstDeltas),
    samples,
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sinkPath;
  void sinkQuery;
}

function createCurrentOperation(
  urls: readonly string[],
  withQuery: boolean,
): () => void {
  let cursor = 0;

  return () => {
    const url = urls[cursor];

    cursor = (cursor + 1) & URL_MASK;

    if (url === undefined) {
      throw new Error("Missing benchmark URL");
    }

    sinkPath = pathnameFromUrl(url);
    sinkQuery = withQuery ? parseQueryFromUrl(url) : undefined;
  };
}

function createSharedOperation(
  urls: readonly string[],
  withQuery: boolean,
): () => void {
  let cursor = 0;

  return () => {
    const url = urls[cursor];

    cursor = (cursor + 1) & URL_MASK;

    if (url === undefined) {
      throw new Error("Missing benchmark URL");
    }

    const queryStart = url.indexOf("?");

    sinkPath = pathnameFromUrlWithKnownQuery(url, queryStart);

    sinkQuery =
      withQuery && queryStart !== -1
        ? parseQueryFromKnownStart(url, queryStart)
        : undefined;
  };
}

function createRuntimeUrls(scenario: Scenario): string[] {
  const urls: string[] = [];

  for (let index = 0; index < URL_COUNT; index++) {
    let rawUrl: string;

    switch (scenario) {
      case "plain":
        rawUrl = `http://gelis.test/r/${4900 + (index % 100)}`;
        break;

      case "basic":
        rawUrl = [
          "http://gelis.test/r/4999",
          `?page=${40 + (index % 10)}`,
          `&q=gelis${index}`,
        ].join("");
        break;

      case "encoded":
        rawUrl = [
          "https://gelis.test/r/4999",
          "?page=42",
          `&q=hello+world%20${index}`,
        ].join("");
        break;

      case "duplicates":
        rawUrl = [
          "http://127.0.0.1:3000/r/4999",
          "?tag=a",
          "&tag=b",
          "&page=42",
          `&q=gelis${index}`,
        ].join("");
        break;

      case "wide":
        rawUrl = [
          "https://[::1]:3000/r/4999",
          `?a=${index}`,
          "&b=two",
          "&c=three",
          "&d=four",
          "&e=five",
          "&f=six",
        ].join("");
        break;
    }

    urls.push(new Request(rawUrl).url);
  }

  return urls;
}

function pathnameFromUrlWithKnownQuery(
  url: string,
  queryStart: number,
): string {
  const schemeEnd = url.indexOf("://");

  if (schemeEnd === -1) {
    return new URL(url).pathname;
  }

  const authorityStart = schemeEnd + 3;
  const pathStart = url.indexOf("/", authorityStart);
  const hashStart = url.indexOf("#", authorityStart);

  if (
    pathStart === -1 ||
    (queryStart !== -1 && queryStart < pathStart) ||
    (hashStart !== -1 && hashStart < pathStart)
  ) {
    return "/";
  }

  let pathEnd = url.length;

  if (queryStart !== -1 && queryStart > pathStart) {
    pathEnd = queryStart;
  }

  if (hashStart !== -1 && hashStart > pathStart && hashStart < pathEnd) {
    pathEnd = hashStart;
  }

  return url.slice(pathStart, pathEnd);
}

function parseQueryFromKnownStart(
  url: string,
  queryStart: number,
): QueryResult {
  const result = Object.create(null) as QueryResult;

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

function verifyCorrectness(): void {
  const rawUrls = [
    "http://gelis.test/r/4999",
    "https://gelis.test/r/4999",
    "http://gelis.test/r/4999?page=42&q=gelis",
    "https://gelis.test/r/4999?page=42&q=gelis",
    "http://127.0.0.1:3000/r/4999?tag=a&tag=b",
    "https://[::1]:3000/r/4999?a=1&b=2",
    "http://gelis.test/?flag",
    "http://gelis.test/?empty=",
    "http://gelis.test/?=value",
    "http://gelis.test/?q=hello+world",
    "http://gelis.test/?q=hello%20world",
    "http://gelis.test/?q=%2B%25",
    "http://gelis.test/?a=one=two",
    "http://gelis.test/?__proto__=safe&constructor=value&toString=x",
    "http://gelis.test/?a=1&&b=2",
    "http://gelis.test/?a=1#fragment",
  ];

  for (const rawUrl of rawUrls) {
    const url = new Request(rawUrl).url;

    const currentPath = pathnameFromUrl(url);
    const queryStart = url.indexOf("?");

    const sharedPath = pathnameFromUrlWithKnownQuery(url, queryStart);

    if (currentPath !== sharedPath) {
      throw new Error(
        `Pathname mismatch: ${url}\ncurrent=${currentPath}\nshared=${sharedPath}`,
      );
    }

    if (queryStart !== -1) {
      const currentQuery = parseQueryFromUrl(url);
      const sharedQuery = parseQueryFromKnownStart(url, queryStart);

      assertEquivalent(currentQuery, sharedQuery, url);
    }
  }

  const malformedUrls = [
    "http://gelis.test/?q=%",
    "https://gelis.test/?q=%2",
    "http://localhost/?q=%GG",
  ];

  for (const rawUrl of malformedUrls) {
    const url = new Request(rawUrl).url;
    const queryStart = url.indexOf("?");

    if (queryStart === -1) {
      throw new Error(`Missing query start: ${url}`);
    }

    const currentError = captureError(() => parseQueryFromUrl(url));

    const sharedError = captureError(() =>
      parseQueryFromKnownStart(url, queryStart),
    );

    if (
      currentError === undefined ||
      sharedError === undefined ||
      currentError.constructor !== sharedError.constructor
    ) {
      throw new Error(`Malformed encoding behavior mismatch: ${url}`);
    }
  }
}

function assertEquivalent(
  current: QueryResult,
  shared: QueryResult,
  url: string,
): void {
  const currentKeys = Object.keys(current);
  const sharedKeys = Object.keys(shared);

  if (
    currentKeys.length !== sharedKeys.length ||
    currentKeys.some((key, index) => key !== sharedKeys[index])
  ) {
    throw new Error(`Query key mismatch: ${url}`);
  }

  for (const key of currentKeys) {
    const left = current[key];
    const right = shared[key];

    if (Array.isArray(left)) {
      if (
        !Array.isArray(right) ||
        left.length !== right.length ||
        left.some((value, index) => value !== right[index])
      ) {
        throw new Error(`Query value mismatch for ${key}: ${url}`);
      }
    } else if (left !== right) {
      throw new Error(`Query value mismatch for ${key}: ${url}`);
    }
  }
}

function captureError(operation: () => unknown): Error | undefined {
  try {
    operation();

    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function warmup(operation: () => void, iterations: number): void {
  for (let index = 0; index < iterations; index++) {
    operation();
  }
}

function calibratePair(current: () => void, shared: () => void): number {
  let iterations = 1000;

  while (true) {
    const currentElapsed = measure(current, iterations);

    const sharedElapsed = measure(shared, iterations);

    const slowerElapsed = Math.max(currentElapsed, sharedElapsed);

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
    typeof candidate.sharedMedianNs === "number" &&
    typeof candidate.pairedMedianDeltaNs === "number" &&
    typeof candidate.pairedMedianDeltaPercent === "number" &&
    typeof candidate.currentCv === "number" &&
    typeof candidate.sharedCv === "number" &&
    typeof candidate.sharedWins === "number" &&
    typeof candidate.currentWins === "number" &&
    typeof candidate.ties === "number" &&
    typeof candidate.currentFirstMedianDeltaPercent === "number" &&
    typeof candidate.sharedFirstMedianDeltaPercent === "number" &&
    Array.isArray(candidate.samples)
  );
}

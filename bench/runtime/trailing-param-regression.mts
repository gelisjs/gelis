import { cpus } from "node:os";

import { Gelis } from "../../src/index.ts";

import { Router } from "../../src/runtime/router.ts";

import type { RuntimeRouteRecord } from "../../src/runtime/types.ts";

const ROUTES = 5000;

const SAMPLES = 7;

const TARGET_MS = 80;

const RAW_RESPONSE = new Response(null, {
  status: 204,
});

let sink: unknown;

type Variant = "generic-only" | "mixed-one-fast" | "mixed-many-fast";

interface Fixture {
  readonly router: Router;

  readonly app: Gelis;

  readonly pathname: string;

  readonly request: Request;
}

interface PairResult {
  readonly baseline: number;

  readonly candidate: number;
}

interface Row {
  readonly scenario: string;

  readonly variant: Variant;

  readonly nsPerOp: number;

  readonly deltaPercent: number;
}

const genericOnly = buildFixture("generic-only");

const mixedOne = buildFixture("mixed-one-fast");

const mixedMany = buildFixture("mixed-many-fast");

verifyFixture(genericOnly);

verifyFixture(mixedOne);

verifyFixture(mixedMany);

const rows: Row[] = [];

const routerOnePair = benchmarkPair(
  () => {
    sink = genericOnly.router.match(
      "GET",

      genericOnly.pathname,
    );
  },

  () => {
    sink = mixedOne.router.match(
      "GET",

      mixedOne.pathname,
    );
  },
);

rows.push(
  row(
    "router",

    "generic-only",

    routerOnePair.baseline,

    routerOnePair.baseline,
  ),
);

rows.push(
  row(
    "router",

    "mixed-one-fast",

    routerOnePair.candidate,

    routerOnePair.baseline,
  ),
);

const routerManyPair = benchmarkPair(
  () => {
    sink = genericOnly.router.match(
      "GET",

      genericOnly.pathname,
    );
  },

  () => {
    sink = mixedMany.router.match(
      "GET",

      mixedMany.pathname,
    );
  },
);

rows.push(
  row(
    "router",

    "mixed-many-fast",

    routerManyPair.candidate,

    routerManyPair.baseline,
  ),
);

const fetchOnePair = benchmarkPair(
  () => {
    sink = genericOnly.app.fetch(genericOnly.request);
  },

  () => {
    sink = mixedOne.app.fetch(mixedOne.request);
  },
);

rows.push(
  row(
    "fetch-raw",

    "generic-only",

    fetchOnePair.baseline,

    fetchOnePair.baseline,
  ),
);

rows.push(
  row(
    "fetch-raw",

    "mixed-one-fast",

    fetchOnePair.candidate,

    fetchOnePair.baseline,
  ),
);

const fetchManyPair = benchmarkPair(
  () => {
    sink = genericOnly.app.fetch(genericOnly.request);
  },

  () => {
    sink = mixedMany.app.fetch(mixedMany.request);
  },
);

rows.push(
  row(
    "fetch-raw",

    "mixed-many-fast",

    fetchManyPair.candidate,

    fetchManyPair.baseline,
  ),
);

console.log("\nGelis trailing-param generic-route regression experiment");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Generic:     ${ROUTES} routes`);

console.log(`Samples:     ${SAMPLES}\n`);

console.table(
  rows.map((result) => ({
    scenario: result.scenario,

    variant: result.variant,

    "ns/op": Math.round(result.nsPerOp),

    "delta %": round(
      result.deltaPercent,

      2,
    ),

    "ops/s": Math.round(1_000_000_000 / result.nsPerOp).toLocaleString("en-US"),
  })),
);

function buildFixture(variant: Variant): Fixture {
  const router = new Router();

  const app = new Gelis();

  /*
   * These routes deliberately do NOT qualify
   * for the trailing-param fast lane because
   * the param is followed by a static segment:
   *
   * /g/123/:id/detail
   */
  for (let index = 0; index < ROUTES; index++) {
    const path = `/g/${index}/:id/detail`;

    const runtimeRoute = makeRuntimeRoute(path);

    router.register(runtimeRoute);

    app.get(path, () => RAW_RESPONSE);
  }

  if (variant === "mixed-one-fast") {
    registerFastRoute(
      router,

      app,

      0,
    );
  }

  if (variant === "mixed-many-fast") {
    for (let index = 0; index < ROUTES; index++) {
      registerFastRoute(
        router,

        app,

        index,
      );
    }
  }

  const pathname = `/g/${ROUTES - 1}/target/detail`;

  return {
    router,

    app,

    pathname,

    request: new Request(`http://gelis.test${pathname}`),
  };
}

function registerFastRoute(
  router: Router,

  app: Gelis,

  index: number,
): void {
  const path = `/t/${index}/:id`;

  router.register(makeRuntimeRoute(path));

  app.get(path, () => RAW_RESPONSE);
}

function makeRuntimeRoute(path: string): RuntimeRouteRecord {
  return {
    method: "GET",

    path,

    handler: () => RAW_RESPONSE,

    flags: 0,

    input: undefined,

    beforeHandle: undefined,

    afterHandle: undefined,

    responses: undefined,
  };
}

function verifyFixture(fixture: Fixture): void {
  const matched = fixture.router.match(
    "GET",

    fixture.pathname,
  );

  if (matched?.params.id !== "target") {
    throw new Error("Generic router fixture failed");
  }

  const response = fixture.app.fetch(fixture.request);

  if (isPromiseLike(response)) {
    throw new Error("Plain raw fixture unexpectedly became asynchronous");
  }

  if (response.status !== 204) {
    throw new Error(`Unexpected fixture response: ${response.status}`);
  }
}

function benchmarkPair(
  baselineOperation: () => void,

  candidateOperation: () => void,
): PairResult {
  warm(baselineOperation);

  warm(candidateOperation);

  const baselineIterations = calibrate(baselineOperation);

  const candidateIterations = calibrate(candidateOperation);

  const baselineSamples: number[] = [];

  const candidateSamples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    if (sample % 2 === 0) {
      baselineSamples.push(
        measure(
          baselineOperation,

          baselineIterations,
        ),
      );

      candidateSamples.push(
        measure(
          candidateOperation,

          candidateIterations,
        ),
      );
    } else {
      candidateSamples.push(
        measure(
          candidateOperation,

          candidateIterations,
        ),
      );

      baselineSamples.push(
        measure(
          baselineOperation,

          baselineIterations,
        ),
      );
    }
  }

  return {
    baseline: median(baselineSamples),

    candidate: median(candidateSamples),
  };
}

function row(
  scenario: string,

  variant: Variant,

  nsPerOp: number,

  baseline: number,
): Row {
  return {
    scenario,

    variant,

    nsPerOp,

    deltaPercent: (nsPerOp / baseline - 1) * 100,
  };
}

function warm(operation: () => void): void {
  for (let index = 0; index < 10_000; index++) {
    operation();
  }
}

function calibrate(operation: () => void): number {
  let iterations = 1000;

  while (true) {
    const elapsed = measureMilliseconds(
      operation,

      iterations,
    );

    if (elapsed >= 10 || iterations >= 10_000_000) {
      return Math.max(
        1,

        Math.round(
          iterations *
            (TARGET_MS /
              Math.max(
                elapsed,

                0.001,
              )),
        ),
      );
    }

    iterations *= 2;
  }
}

function measure(
  operation: () => void,

  iterations: number,
): number {
  return (
    (measureMilliseconds(
      operation,

      iterations,
    ) *
      1_000_000) /
    iterations
  );
}

function measureMilliseconds(
  operation: () => void,

  iterations: number,
): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
  }

  return performance.now() - start;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  const middle = Math.floor(sorted.length / 2);

  const value = sorted[middle];

  if (value === undefined) {
    throw new Error("Cannot compute median of empty samples");
  }

  return value;
}

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value
  );
}

void sink;

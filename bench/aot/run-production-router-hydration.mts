import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "production-router-hydration-worker.mts");

const KINDS = ["static", "trailing", "generic"] as const;

const SCENARIOS = ["register", "hydrate"] as const;

const SAMPLES = 11;

type RouteKind = (typeof KINDS)[number];

type Scenario = (typeof SCENARIOS)[number];

interface Result {
  readonly routeKind: RouteKind;

  readonly scenario: Scenario;

  readonly sample: number;

  readonly constructionMs: number;

  readonly matchNs: number;
}

const raw: Result[] = [];

for (const routeKind of KINDS) {
  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = rotate(SCENARIOS, sample);

    for (const scenario of order) {
      const result = await runWorker(routeKind, scenario, sample);

      raw.push(result);

      console.log(
        [
          routeKind,

          scenario,

          `sample ${sample + 1}/${SAMPLES}`,

          `build ${round(result.constructionMs, 3)} ms`,

          `match ${round(result.matchNs, 1)} ns`,
        ].join(" | "),
      );
    }
  }
}

const rows = KINDS.flatMap((routeKind) =>
  SCENARIOS.map((scenario) => {
    const group = raw.filter(
      (result) =>
        result.routeKind === routeKind && result.scenario === scenario,
    );

    const construction = group.map((result) => result.constructionMs);

    const matching = group.map((result) => result.matchNs);

    return {
      routeKind,

      scenario,

      constructionMedian: median(construction),

      constructionCv: coefficientOfVariation(construction),

      matchMedian: median(matching),

      matchCv: coefficientOfVariation(matching),
    };
  }),
);

console.log("\nGelis P6-D5 production router hydration A/B");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log("Routes:  5000");

console.log(`Samples: ${SAMPLES}`);

console.log("Construction: fresh process per scenario/sample");

console.log("Matching: warmed Router.match() in each process\n");

console.table(
  rows.map((row) => ({
    kind: row.routeKind,

    scenario: row.scenario,

    "construct ms": round(row.constructionMedian, 3),

    "construct cv %": round(row.constructionCv * 100, 2),

    "match ns": round(row.matchMedian, 1),

    "match cv %": round(row.matchCv * 100, 2),
  })),
);

console.log("\nConstruction reduction\n");

for (const routeKind of KINDS) {
  const register = findRow(routeKind, "register");

  const hydrate = findRow(routeKind, "hydrate");

  const reduction =
    (1 - hydrate.constructionMedian / register.constructionMedian) * 100;

  const matchDelta = (hydrate.matchMedian / register.matchMedian - 1) * 100;

  console.log(
    `${routeKind}: ` +
      `${round(register.constructionMedian, 3)} → ` +
      `${round(hydrate.constructionMedian, 3)} ms ` +
      `(${round(reduction, 1)}% lower), ` +
      `match delta ${signed(matchDelta)}%`,
  );
}

function findRow(
  routeKind: RouteKind,

  scenario: Scenario,
) {
  const row = rows.find(
    (candidate) =>
      candidate.routeKind === routeKind && candidate.scenario === scenario,
  );

  if (!row) {
    throw new Error("Missing benchmark row");
  }

  return row;
}

async function runWorker(
  routeKind: RouteKind,

  scenario: Scenario,

  sample: number,
): Promise<Result> {
  const child = Bun.spawn(
    [process.execPath, WORKER],

    {
      cwd: ROOT,

      env: {
        ...process.env,

        ROUTE_KIND: routeKind,

        SCENARIO: scenario,
      },

      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdout = await new Response(child.stdout).text();

  const stderr = await new Response(child.stderr).text();

  const exit = await child.exited;

  if (exit !== 0) {
    throw new Error(
      [
        "Production hydration worker failed",
        `kind=${routeKind}`,
        `scenario=${scenario}`,
        `sample=${sample}`,
        stderr,
      ].join("\n"),
    );
  }

  const line = stdout.trim().split(/\r?\n/).at(-1);

  if (!line) {
    throw new Error("Worker produced no result");
  }

  const parsed = JSON.parse(line) as {
    routeKind: RouteKind;

    scenario: Scenario;

    constructionMs: number;

    matchNs: number;
  };

  return {
    ...parsed,

    sample,
  };
}

function rotate<T>(
  values: readonly T[],

  offset: number,
): T[] {
  const start = offset % values.length;

  return [...values.slice(start), ...values.slice(0, start)];
}

function coefficientOfVariation(values: readonly number[]): number {
  const average =
    values.reduce((total, value) => total + value, 0) / values.length;

  if (average === 0) {
    return 0;
  }

  const variance =
    values.reduce((total, value) => {
      const difference = value - average;

      return total + difference * difference;
    }, 0) / values.length;

  return Math.sqrt(variance) / average;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);

  const value = sorted[Math.floor(sorted.length / 2)];

  if (value === undefined) {
    throw new Error("Empty median");
  }

  return value;
}

function signed(value: number): string {
  const rounded = round(value, 1);

  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

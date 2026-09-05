import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "production-flat-runtime-worker.mts");

const KINDS = ["static", "trailing", "generic"] as const;

const SCENARIOS = ["semantic", "flat"] as const;

const SAMPLES = 31;

type RouteKind = (typeof KINDS)[number];

type Scenario = (typeof SCENARIOS)[number];

interface Result {
  readonly routeKind: RouteKind;

  readonly scenario: Scenario;

  readonly sample: number;

  readonly installMs: number;

  readonly readyMs: number;

  readonly firstFetchUs: number;
}

interface Summary {
  readonly routeKind: RouteKind;

  readonly scenario: Scenario;

  readonly installMedian: number;

  readonly installCv: number;

  readonly readyMedian: number;

  readonly readyCv: number;

  readonly firstFetchMedian: number;

  readonly firstFetchCv: number;
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

          `install ${round(result.installMs, 3)} ms`,

          `ready ${round(result.readyMs, 3)} ms`,

          `first ${round(result.firstFetchUs, 1)} us`,
        ].join(" | "),
      );
    }
  }
}

const rows: Summary[] = KINDS.flatMap((routeKind) =>
  SCENARIOS.map((scenario) => {
    const group = raw.filter(
      (result) =>
        result.routeKind === routeKind && result.scenario === scenario,
    );

    return {
      routeKind,

      scenario,

      installMedian: median(group.map((result) => result.installMs)),

      installCv: coefficientOfVariation(
        group.map((result) => result.installMs),
      ),

      readyMedian: median(group.map((result) => result.readyMs)),

      readyCv: coefficientOfVariation(group.map((result) => result.readyMs)),

      firstFetchMedian: median(group.map((result) => result.firstFetchUs)),

      firstFetchCv: coefficientOfVariation(
        group.map((result) => result.firstFetchUs),
      ),
    };
  }),
);

console.log("\nGelis P6-E6-E3B production flat runtime A/B");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log("Routes:  5000");

console.log(`Samples: ${SAMPLES}`);

console.log("Isolation: fresh process per scenario/sample");

console.log("Build-time plan/artifact preparation excluded from timer\n");

console.table(
  rows.map((row) => ({
    kind: row.routeKind,

    scenario: row.scenario,

    "install ms": round(row.installMedian, 3),

    "install cv %": round(row.installCv * 100, 2),

    "ready ms": round(row.readyMedian, 3),

    "ready cv %": round(row.readyCv * 100, 2),

    "first us": round(row.firstFetchMedian, 1),

    "first cv %": round(row.firstFetchCv * 100, 2),
  })),
);

const comparisons = KINDS.map((routeKind) => {
  const semantic = findRow(routeKind, "semantic");

  const flat = findRow(routeKind, "flat");

  return {
    routeKind,

    installRatio: flat.installMedian / semantic.installMedian,

    readyRatio: flat.readyMedian / semantic.readyMedian,

    firstRatio: flat.firstFetchMedian / semantic.firstFetchMedian,
  };
});

console.log("\nFlat vs semantic\n");

for (const comparison of comparisons) {
  console.log(
    [
      comparison.routeKind,

      `install ${signed((comparison.installRatio - 1) * 100)}%`,

      `ready ${signed((comparison.readyRatio - 1) * 100)}%`,

      `first ${signed((comparison.firstRatio - 1) * 100)}%`,
    ].join(" | "),
  );
}

const installGeomean = geometricMean(
  comparisons.map((comparison) => comparison.installRatio),
);

const readyGeomean = geometricMean(
  comparisons.map((comparison) => comparison.readyRatio),
);

console.log("\nGeomean\n");

console.log(`install ${signed((installGeomean - 1) * 100)}%`);

console.log(`ready   ${signed((readyGeomean - 1) * 100)}%`);

const decision = classify(comparisons, installGeomean);

console.log(`\nDecision: ${decision}`);

function classify(
  values: readonly {
    readonly installRatio: number;

    readonly readyRatio: number;

    readonly firstRatio: number;
  }[],

  installGeomeanRatio: number,
): "STRONG KEEP" | "KEEP" | "BORDERLINE" | "REJECT" {
  const installRatios = values.map((value) => value.installRatio);

  const readyRatios = values.map((value) => value.readyRatio);

  const firstRatios = values.map((value) => value.firstRatio);

  const allInstallFaster = installRatios.every((ratio) => ratio < 1);

  const strong =
    installGeomeanRatio <= 0.9 &&
    allInstallFaster &&
    readyRatios.every((ratio) => ratio <= 1.03) &&
    firstRatios.every((ratio) => ratio <= 1.1);

  if (strong) {
    return "STRONG KEEP";
  }

  const keep =
    installGeomeanRatio <= 1 &&
    installRatios.every((ratio) => ratio <= 1.05) &&
    readyRatios.every((ratio) => ratio <= 1.05) &&
    firstRatios.every((ratio) => ratio <= 1.15);

  if (keep) {
    return "KEEP";
  }

  const reject =
    installGeomeanRatio > 1.05 ||
    installRatios.some((ratio) => ratio > 1.1) ||
    readyRatios.some((ratio) => ratio > 1.1) ||
    firstRatios.some((ratio) => ratio > 1.2);

  if (reject) {
    return "REJECT";
  }

  return "BORDERLINE";
}

function findRow(
  routeKind: RouteKind,

  scenario: Scenario,
): Summary {
  const row = rows.find(
    (candidate) =>
      candidate.routeKind === routeKind && candidate.scenario === scenario,
  );

  if (row === undefined) {
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
        "Production flat runtime worker failed",

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

  const parsed = JSON.parse(line) as Omit<Result, "sample">;

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
    values.reduce(
      (total, value) => total + value,

      0,
    ) / values.length;

  if (average === 0) {
    return 0;
  }

  const variance =
    values.reduce(
      (total, value) => {
        const difference = value - average;

        return total + difference * difference;
      },

      0,
    ) / values.length;

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

function geometricMean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Empty geometric mean");
  }

  let logSum = 0;

  for (const value of values) {
    if (value <= 0) {
      throw new Error("Invalid geometric mean value");
    }

    logSum += Math.log(value);
  }

  return Math.exp(logSum / values.length);
}

function round(
  value: number,

  digits: number,
): number {
  const scale = 10 ** digits;

  return Math.round(value * scale) / scale;
}

function signed(value: number): string {
  const rounded = round(value, 2);

  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

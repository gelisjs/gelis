import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "selective-preorder-policy-worker.mts");

const PROFILES = ["g0", "g1", "g10", "g100", "g500", "g1250", "g2500"] as const;

const SCENARIOS = ["flat", "preorder"] as const;

const SAMPLES = 31;

type MixProfile = (typeof PROFILES)[number];

type Scenario = (typeof SCENARIOS)[number];

interface Result {
  readonly profile: MixProfile;

  readonly scenario: Scenario;

  readonly genericCount: number;

  readonly trailingCount: number;

  readonly sample: number;

  readonly installMs: number;

  readonly readyMs: number;

  readonly firstFetchUs: number;
}

interface Summary {
  readonly profile: MixProfile;

  readonly scenario: Scenario;

  readonly genericCount: number;

  readonly trailingCount: number;

  readonly installMedian: number;

  readonly readyMedian: number;

  readonly firstMedian: number;

  readonly installCv: number;
}

const raw: Result[] = [];

for (const profile of PROFILES) {
  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = rotate(SCENARIOS, sample);

    for (const scenario of order) {
      const result = await runWorker(profile, scenario, sample);

      raw.push(result);

      console.log(
        [
          profile,

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

const rows: Summary[] = PROFILES.flatMap((profile) =>
  SCENARIOS.map((scenario) => {
    const group = raw.filter(
      (result) => result.profile === profile && result.scenario === scenario,
    );

    const first = group[0];

    if (first === undefined) {
      throw new Error("Missing selective policy result group");
    }

    return {
      profile,

      scenario,

      genericCount: first.genericCount,

      trailingCount: first.trailingCount,

      installMedian: median(group.map((result) => result.installMs)),

      readyMedian: median(group.map((result) => result.readyMs)),

      firstMedian: median(group.map((result) => result.firstFetchUs)),

      installCv: coefficientOfVariation(
        group.map((result) => result.installMs),
      ),
    };
  }),
);

console.log("\nGelis P6-E6-E4D selective preorder topology policy");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log("Routes:  5000");

console.log("Static:  2500 fixed");

console.log("Dynamic: 2500 trailing/generic");

console.log(`Samples: ${SAMPLES}`);

console.log("Registration order: static -> trailing -> generic");

console.log("Build-time plan/artifact preparation excluded from timer\n");

console.table(
  rows.map((row) => ({
    profile: row.profile,

    scenario: row.scenario,

    generic: row.genericCount,

    trailing: row.trailingCount,

    "install ms": round(row.installMedian, 3),

    "install cv %": round(row.installCv * 100, 2),

    "ready ms": round(row.readyMedian, 3),

    "first us": round(row.firstMedian, 1),
  })),
);

const comparisons = PROFILES.map((profile) => {
  const flat = findRow(profile, "flat");

  const preorder = findRow(profile, "preorder");

  return {
    profile,

    genericCount: flat.genericCount,

    installRatio: preorder.installMedian / flat.installMedian,

    readyRatio: preorder.readyMedian / flat.readyMedian,

    firstRatio: preorder.firstMedian / flat.firstMedian,
  };
});

console.log("\nPreorder vs flat\n");

for (const comparison of comparisons) {
  console.log(
    [
      comparison.profile,

      `generic ${comparison.genericCount}`,

      `install ${formatRatio(comparison.installRatio)}`,

      `ready ${formatRatio(comparison.readyRatio)}`,

      `first ${formatRatio(comparison.firstRatio)}`,
    ].join(" | "),
  );
}

console.log(`\nPolicy: ${classify(comparisons)}`);

function classify(
  values: readonly {
    readonly profile: MixProfile;

    readonly genericCount: number;

    readonly installRatio: number;

    readonly readyRatio: number;

    readonly firstRatio: number;
  }[],
): string {
  const control = values.find((value) => value.genericCount === 0);

  if (control === undefined) {
    throw new Error("Missing zero-generic control");
  }

  const dynamic = values.filter((value) => value.genericCount > 0);

  const safe = (value: (typeof values)[number]): boolean =>
    value.readyRatio <= 1.05 && value.firstRatio <= 1.15;

  if (
    control.installRatio <= 1.05 &&
    safe(control) &&
    dynamic.every((value) => value.installRatio <= 0.95 && safe(value))
  ) {
    return "USES_DYNAMIC_TRIE => PREORDER";
  }

  for (let start = 0; start < dynamic.length; start++) {
    const candidate = dynamic[start];

    if (candidate === undefined) {
      continue;
    }

    const higher = dynamic.slice(start);

    const lower = dynamic.slice(0, start);

    if (
      higher.length >= 2 &&
      higher.every((value) => value.installRatio <= 0.95 && safe(value)) &&
      lower.every(
        (value) =>
          value.installRatio <= 1.05 &&
          value.readyRatio <= 1.1 &&
          value.firstRatio <= 1.2,
      )
    ) {
      return `THRESHOLD CANDIDATE >= ${candidate.genericCount} GENERIC ROUTES`;
    }
  }

  return "NO AUTOMATIC POLICY";
}

function findRow(
  profile: MixProfile,

  scenario: Scenario,
): Summary {
  const row = rows.find(
    (candidate) =>
      candidate.profile === profile && candidate.scenario === scenario,
  );

  if (row === undefined) {
    throw new Error("Missing selective policy benchmark row");
  }

  return row;
}

async function runWorker(
  profile: MixProfile,

  scenario: Scenario,

  sample: number,
): Promise<Result> {
  const child = Bun.spawn(
    [process.execPath, WORKER],

    {
      cwd: ROOT,

      env: {
        ...process.env,

        MIX_PROFILE: profile,

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
        "Selective preorder policy worker failed",

        `profile=${profile}`,

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

function formatRatio(ratio: number): string {
  const value = round(
    (ratio - 1) * 100,

    2,
  );

  return value > 0 ? `+${value}%` : `${value}%`;
}

function round(
  value: number,

  digits: number,
): number {
  const scale = 10 ** digits;

  return Math.round(value * scale) / scale;
}

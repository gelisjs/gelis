import { randomUUID } from "node:crypto";

import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath, pathToFileURL } from "node:url";

import { writeFlatAotBuildOutput } from "../../src/tooling/flat-aot-build-writer";

import type { FlatAotBuildWriterHost } from "../../src/tooling/flat-aot-build-writer";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "final-source-runtime-worker.mts");

const GENERATED = resolve(HERE, "generated", "final-source-runtime");

const ROUTES = 5000;

const SAMPLES = 31;

const PROFILES = [
  "static",
  "trailing",
  "generic",
  "mixed-low",
  "mixed-balanced",
  "mixed-heavy",
] as const;

const SCENARIOS = ["normal", "aot"] as const;

type Profile = (typeof PROFILES)[number];

type Scenario = (typeof SCENARIOS)[number];

interface RouteShape {
  readonly path: string;

  readonly body: string;
}

interface SourceFixture {
  readonly source: string;

  readonly targetPath: string;

  readonly expectedBody: string;
}

interface GeneratedScenario {
  readonly modulePath: string;

  readonly moduleBytes: number;

  readonly artifactBytes: number;

  readonly buildMs: number | undefined;
}

interface GeneratedProfile {
  readonly profile: Profile;

  readonly targetPath: string;

  readonly expectedBody: string;

  readonly scenarios: Readonly<Record<Scenario, GeneratedScenario>>;
}

interface Result {
  readonly profile: Profile;

  readonly scenario: Scenario;

  readonly sample: number;

  readonly readyMs: number;

  readonly firstFetchUs: number;

  readonly rssMb: number;
}

interface Summary {
  readonly profile: Profile;

  readonly scenario: Scenario;

  readonly moduleBytes: number;

  readonly artifactBytes: number;

  readonly buildMs: number | undefined;

  readonly readyMedian: number;

  readonly readyCv: number;

  readonly firstMedian: number;

  readonly firstCv: number;

  readonly rssMedian: number;
}

await rm(
  GENERATED,

  {
    recursive: true,

    force: true,
  },
);

await mkdir(
  GENERATED,

  {
    recursive: true,
  },
);

const gelisImport = pathToFileURL(resolve(ROOT, "src/app.ts")).href;

const runtimeAdapterImport = pathToFileURL(
  resolve(ROOT, "src/runtime/flat-aot-runtime-adapter.ts"),
).href;

const host = createFileSystemHost();

const generated = new Map<Profile, GeneratedProfile>();

/*
 * This entire section is build-time preparation.
 *
 * Normal source materialization and the production AOT
 * compilation pipeline are completed before runtime
 * samples begin.
 */
for (const profile of PROFILES) {
  const fixture = createSourceFixture(profile, gelisImport);

  const normalModulePath = resolve(GENERATED, `${profile}-normal.mts`);

  await atomicWriteFile(normalModulePath, fixture.source);

  const aotModulePath = resolve(GENERATED, `${profile}-aot.mts`);

  const buildStarted = performance.now();

  const aotOutput = await writeFlatAotBuildOutput(
    fixture.source,

    {
      modulePath: aotModulePath,

      runtimeAdapterImport,

      host,

      compileOptions: {
        fileName: `${profile}.mts`,
      },
    },
  );

  const buildMs = performance.now() - buildStarted;

  const artifactPath = aotOutput.artifactPath;

  if (artifactPath === undefined) {
    throw new Error(`Missing AOT artifact for profile: ${profile}`);
  }

  const normalModuleStats = await stat(normalModulePath);

  const aotModuleStats = await stat(aotModulePath);

  const artifactStats = await stat(artifactPath);

  generated.set(
    profile,

    {
      profile,

      targetPath: fixture.targetPath,

      expectedBody: fixture.expectedBody,

      scenarios: {
        normal: {
          modulePath: normalModulePath,

          moduleBytes: normalModuleStats.size,

          artifactBytes: 0,

          buildMs: undefined,
        },

        aot: {
          modulePath: aotModulePath,

          moduleBytes: aotModuleStats.size,

          artifactBytes: artifactStats.size,

          buildMs,
        },
      },
    },
  );
}

const raw: Result[] = [];

for (const profile of PROFILES) {
  const info = generated.get(profile);

  if (info === undefined) {
    throw new Error(`Missing generated benchmark profile: ${profile}`);
  }

  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = rotate(SCENARIOS, sample);

    for (const scenario of order) {
      const result = await runWorker(info, scenario, sample);

      raw.push(result);

      console.log(
        [
          profile,

          scenario,

          `sample ${sample + 1}/${SAMPLES}`,

          `ready ${round(result.readyMs, 3)} ms`,

          `first ${round(result.firstFetchUs, 1)} us`,

          `rss ${round(result.rssMb, 1)} MB`,
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

    const info = generated.get(profile);

    if (info === undefined) {
      throw new Error(`Missing summary profile: ${profile}`);
    }

    const output = info.scenarios[scenario];

    return {
      profile,

      scenario,

      moduleBytes: output.moduleBytes,

      artifactBytes: output.artifactBytes,

      buildMs: output.buildMs,

      readyMedian: median(group.map((result) => result.readyMs)),

      readyCv: coefficientOfVariation(group.map((result) => result.readyMs)),

      firstMedian: median(group.map((result) => result.firstFetchUs)),

      firstCv: coefficientOfVariation(
        group.map((result) => result.firstFetchUs),
      ),

      rssMedian: median(group.map((result) => result.rssMb)),
    };
  }),
);

console.log("\nGelis P6-E6-E5F final source-to-runtime AOT benchmark");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Routes:  ${ROUTES}`);

console.log(`Samples: ${SAMPLES}`);

console.log("Isolation: fresh process per scenario/sample");

console.log("AOT output produced by writeFlatAotBuildOutput()");

console.log(
  "Build-time source analysis/rewrite/artifact emission excluded from runtime ready",
);

console.log("AOT build ms is diagnostic only and is not a decision metric\n");

console.table(
  rows.map((row) => ({
    profile: row.profile,

    scenario: row.scenario,

    "module KB": round(row.moduleBytes / 1024, 1),

    "artifact KB": round(row.artifactBytes / 1024, 1),

    "build ms": row.buildMs === undefined ? "-" : round(row.buildMs, 3),

    "ready ms": round(row.readyMedian, 3),

    "ready cv %": round(row.readyCv * 100, 2),

    "first us": round(row.firstMedian, 1),

    "first cv %": round(row.firstCv * 100, 2),

    "rss MB": round(row.rssMedian, 1),
  })),
);

const comparisons = PROFILES.map((profile) => {
  const normal = findRow(profile, "normal");

  const aot = findRow(profile, "aot");

  return {
    profile,

    readyRatio: aot.readyMedian / normal.readyMedian,

    firstRatio: aot.firstMedian / normal.firstMedian,

    rssRatio: aot.rssMedian / normal.rssMedian,
  };
});

console.log("\nProduction AOT vs normal\n");

for (const comparison of comparisons) {
  console.log(
    [
      comparison.profile,

      `ready ${formatRatio(comparison.readyRatio)}`,

      `first ${formatRatio(comparison.firstRatio)}`,

      `rss ${formatRatio(comparison.rssRatio)}`,
    ].join(" | "),
  );
}

const readyGeo = geometricMean(
  comparisons.map((comparison) => comparison.readyRatio),
);

const firstGeo = geometricMean(
  comparisons.map((comparison) => comparison.firstRatio),
);

const rssGeo = geometricMean(
  comparisons.map((comparison) => comparison.rssRatio),
);

console.log("\nGeomean production AOT vs normal\n");

console.log(`ready ${formatRatio(readyGeo)}`);

console.log(`first ${formatRatio(firstGeo)}`);

console.log(`rss   ${formatRatio(rssGeo)}`);

console.log(`\nDecision: ${classify(comparisons, readyGeo)}`);

function createSourceFixture(
  profile: Profile,

  gelisImport: string,
): SourceFixture {
  const routes = createRouteShapes(profile);

  if (routes.length !== ROUTES) {
    throw new Error(`Unexpected route count for ${profile}: ${routes.length}`);
  }

  const lines: string[] = [
    `import { Gelis } from ${JSON.stringify(gelisImport)};`,

    "",

    "const app = new Gelis();",

    "",
  ];

  for (const route of routes) {
    lines.push(
      `app.get(${JSON.stringify(route.path)}, () => ${JSON.stringify(route.body)});`,
    );
  }

  lines.push(
    "",

    "export default app;",

    "",
  );

  const target = routes[routes.length - 1];

  if (target === undefined) {
    throw new Error(`Missing target route for ${profile}`);
  }

  return {
    source: lines.join("\n"),

    targetPath: materializeTarget(target.path),

    expectedBody: target.body,
  };
}

function createRouteShapes(profile: Profile): RouteShape[] {
  const routes: RouteShape[] = [];

  switch (profile) {
    case "static":
      appendStatic(routes, ROUTES);

      break;

    case "trailing":
      appendTrailing(routes, ROUTES);

      break;

    case "generic":
      appendGeneric(routes, ROUTES);

      break;

    case "mixed-low":
      appendStatic(routes, 2500);

      appendTrailing(routes, 2490);

      appendGeneric(routes, 10);

      break;

    case "mixed-balanced":
      appendStatic(routes, 2500);

      appendTrailing(routes, 1250);

      appendGeneric(routes, 1250);

      break;

    case "mixed-heavy":
      appendStatic(routes, 2500);

      appendTrailing(routes, 250);

      appendGeneric(routes, 2250);

      break;
  }

  return routes;
}

function appendStatic(
  routes: RouteShape[],

  count: number,
): void {
  for (let index = 0; index < count; index++) {
    routes.push({
      path: `/s/${index}`,

      body: String(routes.length),
    });
  }
}

function appendTrailing(
  routes: RouteShape[],

  count: number,
): void {
  for (let index = 0; index < count; index++) {
    routes.push({
      path: `/t/${index}/:id`,

      body: String(routes.length),
    });
  }
}

function appendGeneric(
  routes: RouteShape[],

  count: number,
): void {
  for (let index = 0; index < count; index++) {
    routes.push({
      path: `/g/${index}/:id/detail`,

      body: String(routes.length),
    });
  }
}

function materializeTarget(path: string): string {
  return path.replace(/:[^/]+/g, "target");
}

async function runWorker(
  info: GeneratedProfile,

  scenario: Scenario,

  sample: number,
): Promise<Result> {
  const output = info.scenarios[scenario];

  const child = Bun.spawn(
    [process.execPath, WORKER],

    {
      cwd: ROOT,

      env: {
        ...process.env,

        MODULE_PATH: output.modulePath,

        TARGET_PATH: info.targetPath,

        EXPECTED_BODY: info.expectedBody,

        PROFILE: info.profile,

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
        "Final source-to-runtime worker failed",

        `profile=${info.profile}`,

        `scenario=${scenario}`,

        `sample=${sample}`,

        stderr,
      ].join("\n"),
    );
  }

  const line = stdout.trim().split(/\r?\n/).at(-1);

  if (!line) {
    throw new Error("Final source-to-runtime worker produced no result");
  }

  const parsed = JSON.parse(line) as Omit<Result, "sample">;

  return {
    ...parsed,

    sample,
  };
}

function createFileSystemHost(): FlatAotBuildWriterHost {
  return {
    writeTextFileAtomically: atomicWriteFile,
  };
}

async function atomicWriteFile(
  destination: string,

  content: string,
): Promise<void> {
  await mkdir(
    dirname(destination),

    {
      recursive: true,
    },
  );

  const temporary =
    `${destination}.` + `${process.pid}.` + `${randomUUID()}.tmp`;

  try {
    await writeFile(temporary, content, "utf8");

    await rename(temporary, destination);
  } finally {
    await rm(
      temporary,

      {
        force: true,
      },
    );
  }
}

function findRow(
  profile: Profile,

  scenario: Scenario,
): Summary {
  const row = rows.find(
    (candidate) =>
      candidate.profile === profile && candidate.scenario === scenario,
  );

  if (row === undefined) {
    throw new Error("Missing final source-to-runtime summary row");
  }

  return row;
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

function classify(
  values: readonly {
    readonly readyRatio: number;

    readonly firstRatio: number;

    readonly rssRatio: number;
  }[],

  readyGeo: number,
): "STRONG KEEP" | "KEEP" | "BORDERLINE" | "REJECT" {
  const strong =
    readyGeo <= 0.8 &&
    values.every(
      (value) =>
        value.readyRatio <= 0.85 &&
        value.firstRatio <= 1.1 &&
        value.rssRatio <= 1.05,
    );

  if (strong) {
    return "STRONG KEEP";
  }

  const keep =
    readyGeo <= 0.9 &&
    values.every(
      (value) =>
        value.readyRatio <= 0.95 &&
        value.firstRatio <= 1.15 &&
        value.rssRatio <= 1.05,
    );

  if (keep) {
    return "KEEP";
  }

  const reject =
    readyGeo > 0.95 ||
    values.some(
      (value) =>
        value.readyRatio > 1.05 ||
        value.firstRatio > 1.2 ||
        value.rssRatio > 1.1,
    );

  if (reject) {
    return "REJECT";
  }

  return "BORDERLINE";
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

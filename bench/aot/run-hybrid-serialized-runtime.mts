import { mkdir } from "node:fs/promises";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { compileFlatAotArtifact } from "../../src/tooling/flat-aot-artifact-compiler.ts";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler.ts";

import { compileHybridAotArtifactCandidate } from "./hybrid-aot-candidate.mts";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "hybrid-serialized-runtime-worker.mts");

const TMP = resolve(HERE, "tmp", "hybrid-serialized-runtime");

const ROUTES = 5000;

const SAMPLES = 31;

const SHAPES = ["shared", "unique", "multi"] as const;

const SCENARIOS = ["current-flat", "hybrid"] as const;

type ShapeKind = (typeof SHAPES)[number];

type Scenario = (typeof SCENARIOS)[number];

interface ArtifactInfo {
  readonly shapeKind: ShapeKind;

  readonly fingerprint: string;

  readonly currentFlatPath: string;

  readonly hybridPath: string;
}

interface Result {
  readonly shapeKind: ShapeKind;

  readonly scenario: Scenario;

  readonly sample: number;

  readonly bytes: number;

  readonly loadMs: number;

  readonly parseMs: number;

  readonly validateMs: number;

  readonly bindMs: number;

  readonly hydrateMs: number;

  readonly installMs: number;

  readonly readyMs: number;

  readonly firstFetchUs: number;
}

await mkdir(TMP, {
  recursive: true,
});

/*
 * Artifact compilation and serialization represent build time
 * and are excluded from every runtime sample.
 */
const artifactInfo = new Map<ShapeKind, ArtifactInfo>();

for (const shapeKind of SHAPES) {
  const plan = await compileSemanticRoutePlan(createRouteShapes(shapeKind));

  const flat = compileFlatAotArtifact(plan);

  const hybrid = compileHybridAotArtifactCandidate(plan, flat);

  const currentFlatPath = resolve(TMP, `${shapeKind}-flat.json`);

  const hybridPath = resolve(TMP, `${shapeKind}-hybrid.json`);

  await Bun.write(currentFlatPath, JSON.stringify(flat));

  await Bun.write(hybridPath, JSON.stringify(hybrid));

  artifactInfo.set(shapeKind, {
    shapeKind,

    fingerprint: plan.shapeFingerprint,

    currentFlatPath,

    hybridPath,
  });
}

const raw: Result[] = [];

for (const shapeKind of SHAPES) {
  const info = artifactInfo.get(shapeKind);

  if (info === undefined) {
    throw new Error(`Missing artifact info: ${shapeKind}`);
  }

  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = rotate(SCENARIOS, sample);

    for (const scenario of order) {
      const result = await runWorker(info, scenario, sample);

      raw.push(result);

      console.log(
        [
          shapeKind,
          scenario,
          `sample ${sample + 1}/${SAMPLES}`,
          `load ${round(result.loadMs, 3)} ms`,
          `parse ${round(result.parseMs, 3)} ms`,
          `bind ${round(result.bindMs, 3)} ms`,
          `hydrate ${round(result.hydrateMs, 3)} ms`,
          `ready ${round(result.readyMs, 3)} ms`,
          `first ${round(result.firstFetchUs, 1)} us`,
        ].join(" | "),
      );
    }
  }
}

const rows = SHAPES.flatMap((shapeKind) =>
  SCENARIOS.map((scenario) => {
    const group = raw.filter(
      (result) =>
        result.shapeKind === shapeKind && result.scenario === scenario,
    );

    return {
      shapeKind,
      scenario,

      bytes: group[0]?.bytes ?? 0,

      loadMs: medianMetric(group, "loadMs"),

      parseMs: medianMetric(group, "parseMs"),

      validateMs: medianMetric(group, "validateMs"),

      bindMs: medianMetric(group, "bindMs"),

      hydrateMs: medianMetric(group, "hydrateMs"),

      installMs: medianMetric(group, "installMs"),

      readyMs: medianMetric(group, "readyMs"),

      firstFetchUs: medianMetric(group, "firstFetchUs"),

      readyCv: coefficientOfVariation(group.map((result) => result.readyMs)),
    };
  }),
);

console.log("\nGelis P6-E6-E3D.4C serialized hybrid runtime integration");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Routes:  ${ROUTES}`);

console.log(`Samples: ${SAMPLES}`);

console.log(
  "Artifact compilation and serialization excluded from runtime timer\n",
);

console.table(
  rows.map((row) => ({
    shape: row.shapeKind,

    scenario: row.scenario,

    bytes: row.bytes,

    load: round(row.loadMs, 3),

    parse: round(row.parseMs, 3),

    validate: round(row.validateMs, 3),

    bind: round(row.bindMs, 3),

    hydrate: round(row.hydrateMs, 3),

    install: round(row.installMs, 3),

    ready: round(row.readyMs, 3),

    "ready cv %": round(row.readyCv * 100, 2),

    "first us": round(row.firstFetchUs, 1),
  })),
);

const ratios: {
  readonly shapeKind: ShapeKind;

  readonly readyRatio: number;

  readonly loadParseRatio: number;

  readonly hydrateRatio: number;

  readonly firstRatio: number;
}[] = [];

console.log("\nHybrid deltas\n");

for (const shapeKind of SHAPES) {
  const current = findRow(shapeKind, "current-flat");

  const hybrid = findRow(shapeKind, "hybrid");

  const currentLoadParse = current.loadMs + current.parseMs;

  const hybridLoadParse = hybrid.loadMs + hybrid.parseMs;

  const ratio = {
    shapeKind,

    readyRatio: hybrid.readyMs / current.readyMs,

    loadParseRatio: hybridLoadParse / currentLoadParse,

    hydrateRatio: hybrid.hydrateMs / current.hydrateMs,

    firstRatio: hybrid.firstFetchUs / current.firstFetchUs,
  };

  ratios.push(ratio);

  console.log(
    [
      shapeKind,

      `load+parse ${formatRatio(ratio.loadParseRatio)}`,

      `hydrate ${formatRatio(ratio.hydrateRatio)}`,

      `ready ${formatRatio(ratio.readyRatio)}`,

      `first ${formatRatio(ratio.firstRatio)}`,
    ].join(" | "),
  );
}

const readyGeo = geometricMean(ratios.map((value) => value.readyRatio));

const loadParseGeo = geometricMean(ratios.map((value) => value.loadParseRatio));

const hydrateGeo = geometricMean(ratios.map((value) => value.hydrateRatio));

const firstGeo = geometricMean(ratios.map((value) => value.firstRatio));

console.log("\nGeomean hybrid vs current flat");

console.log(`load+parse ${formatRatio(loadParseGeo)}`);

console.log(`hydrate    ${formatRatio(hydrateGeo)}`);

console.log(`ready      ${formatRatio(readyGeo)}`);

console.log(`first      ${formatRatio(firstGeo)}`);

console.log(`\nDecision: ${classify(ratios, readyGeo, loadParseGeo)}`);

function classify(
  ratios: readonly {
    readonly readyRatio: number;

    readonly loadParseRatio: number;

    readonly firstRatio: number;
  }[],

  readyGeo: number,

  loadParseGeo: number,
): "STRONG SIGNAL" | "ADVANCE" | "BORDERLINE" | "STOP" {
  if (
    readyGeo <= 0.85 &&
    loadParseGeo <= 0.95 &&
    ratios.every((value) => value.readyRatio <= 0.9 && value.firstRatio <= 1.1)
  ) {
    return "STRONG SIGNAL";
  }

  if (
    readyGeo <= 0.9 &&
    loadParseGeo <= 1.05 &&
    ratios.every(
      (value) => value.readyRatio <= 0.97 && value.firstRatio <= 1.15,
    )
  ) {
    return "ADVANCE";
  }

  if (
    readyGeo >= 0.95 ||
    loadParseGeo > 1.1 ||
    ratios.some((value) => value.readyRatio > 1.05 || value.firstRatio > 1.2)
  ) {
    return "STOP";
  }

  return "BORDERLINE";
}

function findRow(
  shapeKind: ShapeKind,

  scenario: Scenario,
) {
  const row = rows.find(
    (candidate) =>
      candidate.shapeKind === shapeKind && candidate.scenario === scenario,
  );

  if (row === undefined) {
    throw new Error("Missing serialized hybrid benchmark row");
  }

  return row;
}

async function runWorker(
  info: ArtifactInfo,

  scenario: Scenario,

  sample: number,
): Promise<Result> {
  const artifactPath =
    scenario === "current-flat" ? info.currentFlatPath : info.hybridPath;

  const child = Bun.spawn(
    [process.execPath, WORKER],

    {
      cwd: ROOT,

      env: {
        ...process.env,

        SHAPE_KIND: info.shapeKind,

        SCENARIO: scenario,

        ARTIFACT_PATH: artifactPath,

        SHAPE_FINGERPRINT: info.fingerprint,
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
        "Serialized hybrid runtime worker failed",
        `shape=${info.shapeKind}`,
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

function createRouteShapes(shape: ShapeKind): readonly {
  readonly method: "GET";

  readonly path: string;
}[] {
  const result = new Array<{
    method: "GET";

    path: string;
  }>(ROUTES);

  for (let index = 0; index < ROUTES; index++) {
    switch (shape) {
      case "shared":
        result[index] = {
          method: "GET",

          path: `/r/${index}/:id/detail`,
        };

        break;

      case "unique":
        result[index] = {
          method: "GET",

          path: `/r/${index}/:p${index}/detail`,
        };

        break;

      case "multi":
        result[index] = {
          method: "GET",

          path: `/r/${index}/:team/users/:id/detail`,
        };

        break;
    }
  }

  return result;
}

function medianMetric<
  K extends
    | "loadMs"
    | "parseMs"
    | "validateMs"
    | "bindMs"
    | "hydrateMs"
    | "installMs"
    | "readyMs"
    | "firstFetchUs",
>(
  values: readonly Result[],

  key: K,
): number {
  return median(values.map((value) => value[key]));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);

  const value = sorted[Math.floor(sorted.length / 2)];

  if (value === undefined) {
    throw new Error("Empty median");
  }

  return value;
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

function geometricMean(values: readonly number[]): number {
  return Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) / values.length,
  );
}

function rotate<T>(
  values: readonly T[],

  offset: number,
): T[] {
  const start = offset % values.length;

  return [...values.slice(start), ...values.slice(0, start)];
}

function formatRatio(ratio: number): string {
  const percent = (ratio - 1) * 100;

  const rounded = round(percent, 2);

  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

function round(
  value: number,

  digits: number,
): number {
  const scale = 10 ** digits;

  return Math.round(value * scale) / scale;
}

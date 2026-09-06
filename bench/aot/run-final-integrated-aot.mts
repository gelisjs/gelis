import { mkdir } from "node:fs/promises";

import { cpus } from "node:os";

import { dirname, relative, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { compileFlatAotArtifact } from "../../src/tooling/flat-aot-artifact-compiler.ts";

import { compilePreorderAotArtifact } from "../../src/tooling/preorder-aot-artifact-compiler.ts";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "final-integrated-aot-worker.mts");

const TMP = resolve(HERE, "tmp", "final-integrated-aot");

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

const SCENARIOS = ["normal", "flat", "preorder"] as const;

type Profile = (typeof PROFILES)[number];

type Scenario = (typeof SCENARIOS)[number];

interface RouteShape {
  readonly method: "GET";

  readonly path: string;
}

interface GeneratedScenario {
  readonly modulePath: string;

  readonly moduleBytes: number;

  readonly artifactBytes: number;
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

  readonly readyMedian: number;

  readonly readyCv: number;

  readonly firstMedian: number;

  readonly firstCv: number;

  readonly rssMedian: number;
}

await mkdir(TMP, {
  recursive: true,
});

/*
 * Everything in this section is build-time preparation.
 *
 * Source transformation, semantic planning, artifact
 * compilation and serialization are deliberately excluded
 * from every runtime sample.
 */
const generated = new Map<Profile, GeneratedProfile>();

for (const profile of PROFILES) {
  const routes = createRouteShapes(profile);

  if (routes.length !== ROUTES) {
    throw new Error(
      `Unexpected final integrated route count: ${routes.length}`,
    );
  }

  const plan = await compileSemanticRoutePlan(routes);

  const flatArtifact = compileFlatAotArtifact(plan);

  const preorderArtifact = compilePreorderAotArtifact(plan);

  const flatArtifactPath = resolve(TMP, `${profile}-flat.json`);

  const preorderArtifactPath = resolve(TMP, `${profile}-preorder.json`);

  const flatArtifactText = JSON.stringify(flatArtifact);

  const preorderArtifactText = JSON.stringify(preorderArtifact);

  await Bun.write(flatArtifactPath, flatArtifactText);

  await Bun.write(preorderArtifactPath, preorderArtifactText);

  const normalSource = generateNormalModule(routes);

  const flatSource = generateFlatModule(routes, flatArtifactPath);

  const preorderSource = generatePreorderModule(routes, preorderArtifactPath);

  const normalPath = resolve(TMP, `${profile}-normal.mts`);

  const flatPath = resolve(TMP, `${profile}-flat.mts`);

  const preorderPath = resolve(TMP, `${profile}-preorder.mts`);

  await Bun.write(normalPath, normalSource);

  await Bun.write(flatPath, flatSource);

  await Bun.write(preorderPath, preorderSource);

  const lastRoute = routes[routes.length - 1];

  if (lastRoute === undefined) {
    throw new Error("Missing final integrated target route");
  }

  generated.set(profile, {
    profile,

    targetPath: materializeTarget(lastRoute.path),

    expectedBody: String(routes.length - 1),

    scenarios: {
      normal: {
        modulePath: normalPath,

        moduleBytes: byteLength(normalSource),

        artifactBytes: 0,
      },

      flat: {
        modulePath: flatPath,

        moduleBytes: byteLength(flatSource),

        artifactBytes: byteLength(flatArtifactText),
      },

      preorder: {
        modulePath: preorderPath,

        moduleBytes: byteLength(preorderSource),

        artifactBytes: byteLength(preorderArtifactText),
      },
    },
  });
}

const raw: Result[] = [];

for (const profile of PROFILES) {
  const info = generated.get(profile);

  if (info === undefined) {
    throw new Error(`Missing generated profile: ${profile}`);
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
      throw new Error(`Missing generated profile summary: ${profile}`);
    }

    const generatedScenario = info.scenarios[scenario];

    return {
      profile,

      scenario,

      moduleBytes: generatedScenario.moduleBytes,

      artifactBytes: generatedScenario.artifactBytes,

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

console.log("\nGelis P6-E6-E4E final integrated AOT decision");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Routes:  ${ROUTES}`);

console.log(`Samples: ${SAMPLES}`);

console.log("Isolation: fresh process per scenario/sample");

console.log("Runtime ready includes generated module import");

console.log(
  "AOT ready includes artifact read + JSON parse + handler creation + binding + hydration + install",
);

console.log("Build-time transformation/artifact generation excluded\n");

console.table(
  rows.map((row) => ({
    profile: row.profile,

    scenario: row.scenario,

    "module KB": round(row.moduleBytes / 1024, 1),

    "artifact KB": round(row.artifactBytes / 1024, 1),

    "ready ms": round(row.readyMedian, 3),

    "ready cv %": round(row.readyCv * 100, 2),

    "first us": round(row.firstMedian, 1),

    "first cv %": round(row.firstCv * 100, 2),

    "rss MB": round(row.rssMedian, 1),
  })),
);

const comparisons = PROFILES.map((profile) => {
  const normal = findRow(profile, "normal");

  const flat = findRow(profile, "flat");

  const preorder = findRow(profile, "preorder");

  return {
    profile,

    preorderVsFlatReady: preorder.readyMedian / flat.readyMedian,

    preorderVsFlatFirst: preorder.firstMedian / flat.firstMedian,

    preorderVsNormalReady: preorder.readyMedian / normal.readyMedian,

    flatVsNormalReady: flat.readyMedian / normal.readyMedian,
  };
});

console.log("\nPreorder vs flat\n");

for (const value of comparisons) {
  console.log(
    [
      value.profile,

      `ready ${formatRatio(value.preorderVsFlatReady)}`,

      `first ${formatRatio(value.preorderVsFlatFirst)}`,

      `preorder vs normal ${formatRatio(value.preorderVsNormalReady)}`,

      `flat vs normal ${formatRatio(value.flatVsNormalReady)}`,
    ].join(" | "),
  );
}

const preorderFlatReadyGeo = geometricMean(
  comparisons.map((value) => value.preorderVsFlatReady),
);

const preorderFlatFirstGeo = geometricMean(
  comparisons.map((value) => value.preorderVsFlatFirst),
);

const preorderNormalReadyGeo = geometricMean(
  comparisons.map((value) => value.preorderVsNormalReady),
);

const flatNormalReadyGeo = geometricMean(
  comparisons.map((value) => value.flatVsNormalReady),
);

console.log("\nGeomean\n");

console.log(`preorder vs flat ready   ${formatRatio(preorderFlatReadyGeo)}`);

console.log(`preorder vs flat first   ${formatRatio(preorderFlatFirstGeo)}`);

console.log(`preorder vs normal ready ${formatRatio(preorderNormalReadyGeo)}`);

console.log(`flat vs normal ready     ${formatRatio(flatNormalReadyGeo)}`);

console.log(
  `\nDecision: ${classify(
    comparisons,
    preorderFlatReadyGeo,
    preorderNormalReadyGeo,
  )}`,
);

function classify(
  values: readonly {
    readonly preorderVsFlatReady: number;

    readonly preorderVsFlatFirst: number;
  }[],

  preorderFlatReadyGeo: number,

  preorderNormalReadyGeo: number,
): "STRONG KEEP" | "KEEP" | "BORDERLINE" | "REJECT AS PRIMARY FORMAT" {
  const strong =
    preorderFlatReadyGeo <= 0.9 &&
    preorderNormalReadyGeo <= 0.9 &&
    values.every(
      (value) =>
        value.preorderVsFlatReady <= 1.03 && value.preorderVsFlatFirst <= 1.1,
    );

  if (strong) {
    return "STRONG KEEP";
  }

  const keep =
    preorderFlatReadyGeo <= 0.95 &&
    preorderNormalReadyGeo < 1 &&
    values.every(
      (value) =>
        value.preorderVsFlatReady <= 1.05 && value.preorderVsFlatFirst <= 1.15,
    );

  if (keep) {
    return "KEEP";
  }

  const reject =
    preorderFlatReadyGeo > 0.97 ||
    values.some(
      (value) =>
        value.preorderVsFlatReady > 1.1 || value.preorderVsFlatFirst > 1.2,
    );

  if (reject) {
    return "REJECT AS PRIMARY FORMAT";
  }

  return "BORDERLINE";
}

async function runWorker(
  info: GeneratedProfile,

  scenario: Scenario,

  sample: number,
): Promise<Result> {
  const generatedScenario = info.scenarios[scenario];

  const child = Bun.spawn(
    [process.execPath, WORKER],

    {
      cwd: ROOT,

      env: {
        ...process.env,

        MODULE_PATH: generatedScenario.modulePath,

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
        "Final integrated AOT worker failed",

        `profile=${info.profile}`,

        `scenario=${scenario}`,

        `sample=${sample}`,

        stderr,
      ].join("\n"),
    );
  }

  const line = stdout.trim().split(/\r?\n/).at(-1);

  if (!line) {
    throw new Error("Final integrated AOT worker produced no result");
  }

  const parsed = JSON.parse(line) as Omit<Result, "sample">;

  return {
    ...parsed,

    sample,
  };
}

function generateNormalModule(routes: readonly RouteShape[]): string {
  const lines: string[] = [
    `import { Gelis } from ${JSON.stringify(sourceImport("src/app.ts"))};`,
    "",
    "const app = new Gelis();",
    "",
  ];

  for (let index = 0; index < routes.length; index++) {
    const route = routes[index];

    if (route === undefined) {
      throw new Error(`Missing normal generated route: ${index}`);
    }

    lines.push(
      `app.get(${JSON.stringify(route.path)}, () => ${JSON.stringify(String(index))});`,
    );
  }

  lines.push("", "export default app;", "");

  return lines.join("\n");
}

function generateFlatModule(
  routes: readonly RouteShape[],

  artifactPath: string,
): string {
  return generateAotModule(routes, artifactPath, "flat");
}

function generatePreorderModule(
  routes: readonly RouteShape[],

  artifactPath: string,
): string {
  return generateAotModule(routes, artifactPath, "preorder");
}

function generateAotModule(
  routes: readonly RouteShape[],

  artifactPath: string,

  kind: "flat" | "preorder",
): string {
  const lines: string[] = [
    `import { Gelis } from ${JSON.stringify(sourceImport("src/app.ts"))};`,
    "",
  ];

  if (kind === "flat") {
    lines.push(
      `import { FLAT_AOT_ARTIFACT_VERSION } from ${JSON.stringify(
        sourceImport("src/runtime/flat-aot-artifact.ts"),
      )};`,

      `import { installFlatAotRuntime } from ${JSON.stringify(
        sourceImport("src/runtime/flat-aot-runtime.ts"),
      )};`,
    );
  } else {
    lines.push(
      `import { PREORDER_AOT_ARTIFACT_VERSION } from ${JSON.stringify(
        sourceImport("src/runtime/preorder-aot-artifact.ts"),
      )};`,

      `import { installPreorderAotRuntime } from ${JSON.stringify(
        sourceImport("src/runtime/preorder-aot-runtime.ts"),
      )};`,
    );
  }

  lines.push("", "const handlers = [");

  for (let index = 0; index < routes.length; index++) {
    lines.push(`  () => ${JSON.stringify(String(index))},`);
  }

  lines.push(
    "];",
    "",
    `const artifactText = await Bun.file(${JSON.stringify(
      artifactPath,
    )}).text();`,
    "",
    "const artifact = JSON.parse(artifactText);",
    "",
    "const app = new Gelis();",
    "",
  );

  if (kind === "flat") {
    lines.push(
      "installFlatAotRuntime(",
      "  app,",
      "  artifact,",
      "  {",
      "    version: FLAT_AOT_ARTIFACT_VERSION,",
      "    shapeFingerprint: artifact[2],",
      "    handlers,",
      "  },",
      ");",
    );
  } else {
    lines.push(
      "installPreorderAotRuntime(",
      "  app,",
      "  artifact,",
      "  {",
      "    version: PREORDER_AOT_ARTIFACT_VERSION,",
      "    shapeFingerprint: artifact[2],",
      "    handlers,",
      "  },",
      ");",
    );
  }

  lines.push("", "export default app;", "");

  return lines.join("\n");
}

function sourceImport(path: string): string {
  const target = resolve(ROOT, path);

  let specifier = relative(TMP, target).replaceAll("\\", "/");

  if (!specifier.startsWith(".")) {
    specifier = `./${specifier}`;
  }

  return specifier;
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
      method: "GET",

      path: `/s/${index}`,
    });
  }
}

function appendTrailing(
  routes: RouteShape[],

  count: number,
): void {
  for (let index = 0; index < count; index++) {
    routes.push({
      method: "GET",

      path: `/t/${index}/:id`,
    });
  }
}

function appendGeneric(
  routes: RouteShape[],

  count: number,
): void {
  for (let index = 0; index < count; index++) {
    routes.push({
      method: "GET",

      path: `/g/${index}/:id/detail`,
    });
  }
}

function materializeTarget(path: string): string {
  return path.replace(/:[^/]+/g, "target");
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
    throw new Error("Missing final integrated benchmark row");
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

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
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

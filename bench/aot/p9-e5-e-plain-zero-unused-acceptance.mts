import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CONTROL_SHA = "f2d2666e0c38c39a29d13163da597676c0d9637c";
const ROUTES = 5_000;
const SAMPLES_PER_ORIENTATION = 31;
const READY_GEO_MAX = 1.03;
const READY_PROFILE_MAX = 1.05;
const FIRST_GEO_MAX = 1.03;
const FIRST_PROFILE_MAX = 1.07;
const RSS_PROFILE_MAX = 1.05;

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = resolve(HERE, "p9-e5-e-plain-zero-unused-worker.mts");

const PROFILES = ["static", "trailing", "mixed-balanced"] as const;
type Profile = (typeof PROFILES)[number];
type Scenario = "control" | "candidate";

interface RouteShape {
  readonly path: string;
  readonly body: string;
}

interface GeneratedScenario {
  readonly modulePath: string;
  readonly artifactPath: string;
  readonly artifactJson: string;
  readonly moduleBytes: number;
  readonly artifactBytes: number;
}

interface GeneratedProfile {
  readonly profile: Profile;
  readonly targetPath: string;
  readonly expectedBody: string;
  readonly scenarios: Readonly<Record<Scenario, GeneratedScenario>>;
}

interface WorkerResult {
  readonly profile: Profile;
  readonly scenario: Scenario;
  readonly readyMs: number;
  readonly firstFetchUs: number;
  readonly rssMb: number;
}

interface MetricSample {
  readonly controlFirstRatio: number;
  readonly candidateFirstRatio: number;
  readonly mirroredRatio: number;
}

interface ProfileSummary {
  readonly profile: Profile;
  readonly readyRatio: number;
  readonly firstRatio: number;
  readonly rssRatio: number;
  readonly readyControlFirst: number;
  readonly readyCandidateFirst: number;
  readonly firstControlFirst: number;
  readonly firstCandidateFirst: number;
  readonly artifactExact: boolean;
  readonly versionExact: boolean;
  readonly zeroUnused: boolean;
  readonly pass: boolean;
}

interface FlatAotBuildWriterHost {
  writeTextFileAtomically(path: string, content: string): Promise<void>;
}

interface WriteFlatAotBuildOutput {
  (
    sourceText: string,
    options: {
      readonly modulePath: string;
      readonly runtimeAdapterImport: string;
      readonly host: FlatAotBuildWriterHost;
      readonly compileOptions?: {
        readonly fileName?: string;
      };
    },
  ): Promise<{
    readonly artifactPath: string | undefined;
  }>;
}

const args = process.argv.slice(2);
const controlRoot = readRoot(args, "--control-root=");
const candidateRoot = readRoot(args, "--candidate-root=", ".");
const controlHead = gitHead(controlRoot);
const candidateHead = gitHead(candidateRoot);

if (controlHead !== CONTROL_SHA) {
  throw new Error(`Control is at ${controlHead}; expected ${CONTROL_SHA}`);
}

if (candidateHead === controlHead && gitStatus(candidateRoot) === "") {
  throw new Error("Candidate equals clean P9-E5 control");
}

const generatedRoot = await mkdtemp(join(tmpdir(), "gelis-p9-e5-e-plain-"));

try {
  const generated = new Map<Profile, GeneratedProfile>();

  for (const profile of PROFILES) {
    const control = await generateScenario(controlRoot, "control", profile);
    const candidate = await generateScenario(
      candidateRoot,
      "candidate",
      profile,
    );

    const routes = createRouteShapes(profile);
    const target = routes.at(-1);

    if (target === undefined) {
      throw new Error(`Missing target route for ${profile}`);
    }

    generated.set(profile, {
      profile,
      targetPath: materializeTarget(target.path),
      expectedBody: target.body,
      scenarios: {
        control,
        candidate,
      },
    });
  }

  console.log("\nP9-E5-E plain AOT zero-unused acceptance\n");
  console.log(`Runtime:                bun ${Bun.version}`);
  console.log(`CPU:                    ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`Routes/profile:         ${ROUTES}`);
  console.log(`Samples/orientation:    ${SAMPLES_PER_ORIENTATION}`);
  console.log(`Control SHA:            ${controlHead}`);
  console.log(`Candidate HEAD:         ${candidateHead}`);
  console.log("Profiles:               static, trailing, mixed-balanced");
  console.log("Isolation:              fresh Bun process per scenario/sample");
  console.log(
    "Orientations:           control→candidate and candidate→control",
  );
  console.log("Artifact gate:          exact JSON bytes + exact version");
  console.log("Plain generated source: no managed-input sidecar/import");
  console.log("Ready gates:            geomean <= 1.03x; profile <= 1.05x");
  console.log("First-fetch gates:      geomean <= 1.03x; profile <= 1.07x");
  console.log("RSS gate:               profile <= 1.05x\n");

  const summaries: ProfileSummary[] = [];

  for (const profile of PROFILES) {
    const info = generated.get(profile);

    if (info === undefined) {
      throw new Error(`Missing generated profile: ${profile}`);
    }

    const readySamples: MetricSample[] = [];
    const firstSamples: MetricSample[] = [];
    const rssSamples: MetricSample[] = [];

    for (let sample = 0; sample < SAMPLES_PER_ORIENTATION; sample++) {
      const controlFirstControl = await runWorker(info, "control");
      const controlFirstCandidate = await runWorker(info, "candidate");
      const candidateFirstCandidate = await runWorker(info, "candidate");
      const candidateFirstControl = await runWorker(info, "control");

      readySamples.push(
        metricSample(
          controlFirstControl.readyMs,
          controlFirstCandidate.readyMs,
          candidateFirstControl.readyMs,
          candidateFirstCandidate.readyMs,
        ),
      );

      firstSamples.push(
        metricSample(
          controlFirstControl.firstFetchUs,
          controlFirstCandidate.firstFetchUs,
          candidateFirstControl.firstFetchUs,
          candidateFirstCandidate.firstFetchUs,
        ),
      );

      rssSamples.push(
        metricSample(
          controlFirstControl.rssMb,
          controlFirstCandidate.rssMb,
          candidateFirstControl.rssMb,
          candidateFirstCandidate.rssMb,
        ),
      );

      console.log(
        [
          profile,
          `sample ${sample + 1}/${SAMPLES_PER_ORIENTATION}`,
          `ready ${formatRatio(readySamples.at(-1)!.mirroredRatio)}`,
          `first ${formatRatio(firstSamples.at(-1)!.mirroredRatio)}`,
          `rss ${formatRatio(rssSamples.at(-1)!.mirroredRatio)}`,
        ].join(" | "),
      );
    }

    const controlArtifact = info.scenarios.control.artifactJson;
    const candidateArtifact = info.scenarios.candidate.artifactJson;
    const controlVersion = artifactVersion(controlArtifact);
    const candidateVersion = artifactVersion(candidateArtifact);
    const candidateSource = await readFile(
      info.scenarios.candidate.modulePath,
      "utf8",
    );

    const artifactExact = candidateArtifact === controlArtifact;
    const versionExact = candidateVersion === controlVersion;
    const zeroUnused =
      !candidateSource.includes("__gelisAotInputBindings") &&
      !candidateSource.includes("__gelisAotCaptureManagedInput") &&
      !candidateSource.includes("captureFlatAotManagedInput");

    const readyRatio = median(
      readySamples.map((sample) => sample.mirroredRatio),
    );
    const firstRatio = median(
      firstSamples.map((sample) => sample.mirroredRatio),
    );
    const rssRatio = median(rssSamples.map((sample) => sample.mirroredRatio));

    summaries.push({
      profile,
      readyRatio,
      firstRatio,
      rssRatio,
      readyControlFirst: median(
        readySamples.map((sample) => sample.controlFirstRatio),
      ),
      readyCandidateFirst: median(
        readySamples.map((sample) => sample.candidateFirstRatio),
      ),
      firstControlFirst: median(
        firstSamples.map((sample) => sample.controlFirstRatio),
      ),
      firstCandidateFirst: median(
        firstSamples.map((sample) => sample.candidateFirstRatio),
      ),
      artifactExact,
      versionExact,
      zeroUnused,
      pass:
        readyRatio <= READY_PROFILE_MAX &&
        firstRatio <= FIRST_PROFILE_MAX &&
        rssRatio <= RSS_PROFILE_MAX &&
        artifactExact &&
        versionExact &&
        zeroUnused,
    });
  }

  const readyGeo = geometricMean(
    summaries.map((summary) => summary.readyRatio),
  );
  const firstGeo = geometricMean(
    summaries.map((summary) => summary.firstRatio),
  );

  console.log("\nP9-E5-E plain zero-unused summary\n");
  console.table(
    summaries.map((summary) => ({
      profile: summary.profile,
      "ready ratio": round(summary.readyRatio, 4),
      "ready C-first": round(summary.readyControlFirst, 4),
      "ready N-first": round(summary.readyCandidateFirst, 4),
      "first ratio": round(summary.firstRatio, 4),
      "first C-first": round(summary.firstControlFirst, 4),
      "first N-first": round(summary.firstCandidateFirst, 4),
      "rss ratio": round(summary.rssRatio, 4),
      artifact: summary.artifactExact ? "exact" : "DIFF",
      version: summary.versionExact ? "exact" : "DIFF",
      "zero-unused": summary.zeroUnused ? "yes" : "NO",
      verdict: summary.pass ? "PASS" : "FAIL",
    })),
  );

  console.log(`\nready geomean ${formatRatio(readyGeo)} (gate <= 1.03x)`);
  console.log(`first geomean ${formatRatio(firstGeo)} (gate <= 1.03x)`);

  const pass =
    summaries.every((summary) => summary.pass) &&
    readyGeo <= READY_GEO_MAX &&
    firstGeo <= FIRST_GEO_MAX;

  if (!pass) {
    throw new Error("P9-E5-E plain zero-unused gate failed");
  }

  console.log("\nVerdict: PASS");
} finally {
  await rm(generatedRoot, { recursive: true, force: true });
}

async function generateScenario(
  root: string,
  scenario: Scenario,
  profile: Profile,
): Promise<GeneratedScenario> {
  const writerModule = (await import(
    pathToFileURL(resolve(root, "src/tooling/flat-aot-build-writer.ts")).href
  )) as {
    readonly writeFlatAotBuildOutput: WriteFlatAotBuildOutput;
  };

  const fixture = createSourceFixture(profile, root);
  const directory = resolve(generatedRoot, scenario, profile);
  const modulePath = resolve(directory, "application.mts");
  const runtimeAdapterImport = pathToFileURL(
    resolve(root, "src/runtime/flat-aot-runtime-adapter.ts"),
  ).href;

  const output = await writerModule.writeFlatAotBuildOutput(fixture, {
    modulePath,
    runtimeAdapterImport,
    host: {
      writeTextFileAtomically: atomicWriteFile,
    },
    compileOptions: {
      fileName: `${scenario}-${profile}.mts`,
    },
  });

  if (output.artifactPath === undefined) {
    throw new Error(`Missing ${scenario} artifact for ${profile}`);
  }

  const [moduleStats, artifactStats, artifactJson] = await Promise.all([
    stat(modulePath),
    stat(output.artifactPath),
    readFile(output.artifactPath, "utf8"),
  ]);

  return {
    modulePath,
    artifactPath: output.artifactPath,
    artifactJson,
    moduleBytes: moduleStats.size,
    artifactBytes: artifactStats.size,
  };
}

function createSourceFixture(profile: Profile, root: string): string {
  const routes = createRouteShapes(profile);

  if (routes.length !== ROUTES) {
    throw new Error(`Unexpected route count for ${profile}: ${routes.length}`);
  }

  const gelisImport = pathToFileURL(resolve(root, "src/app.ts")).href;
  const lines = [
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

  lines.push("", "export default app;", "");
  return lines.join("\n");
}

function createRouteShapes(profile: Profile): RouteShape[] {
  const routes: RouteShape[] = [];

  if (profile === "static") {
    appendStatic(routes, ROUTES);
  } else if (profile === "trailing") {
    appendTrailing(routes, ROUTES);
  } else {
    appendStatic(routes, 2_500);
    appendTrailing(routes, 1_250);
    appendGeneric(routes, 1_250);
  }

  return routes;
}

function appendStatic(routes: RouteShape[], count: number): void {
  for (let index = 0; index < count; index++) {
    routes.push({ path: `/s/${index}`, body: String(routes.length) });
  }
}

function appendTrailing(routes: RouteShape[], count: number): void {
  for (let index = 0; index < count; index++) {
    routes.push({ path: `/t/${index}/:id`, body: String(routes.length) });
  }
}

function appendGeneric(routes: RouteShape[], count: number): void {
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
): Promise<WorkerResult> {
  const output = info.scenarios[scenario];
  const child = Bun.spawn([process.execPath, WORKER], {
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
  });

  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  const exit = await child.exited;

  if (exit !== 0) {
    throw new Error(
      `P9-E5-E plain worker failed (${info.profile}/${scenario})\n${stderr}`,
    );
  }

  const line = stdout.trim().split(/\r?\n/).at(-1);

  if (!line) {
    throw new Error("P9-E5-E plain worker produced no result");
  }

  return JSON.parse(line) as WorkerResult;
}

function metricSample(
  controlFirstControl: number,
  controlFirstCandidate: number,
  candidateFirstControl: number,
  candidateFirstCandidate: number,
): MetricSample {
  const controlFirstRatio = controlFirstCandidate / controlFirstControl;
  const candidateFirstRatio = candidateFirstCandidate / candidateFirstControl;

  return {
    controlFirstRatio,
    candidateFirstRatio,
    mirroredRatio: Math.sqrt(controlFirstRatio * candidateFirstRatio),
  };
}

function artifactVersion(value: string): unknown {
  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Flat AOT artifact is not an array");
  }

  return parsed[0];
}

async function atomicWriteFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function readRoot(
  values: readonly string[],
  prefix: string,
  fallback?: string,
): string {
  const argument = values.find((value) => value.startsWith(prefix));
  const value = argument?.slice(prefix.length) ?? fallback;

  if (!value) {
    throw new Error(`Expected ${prefix}<path>`);
  }

  return resolve(value);
}

function gitHead(root: string): string {
  return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

function gitStatus(root: string): string {
  return execFileSync("git", ["-C", root, "status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute median of empty values");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function geometricMean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute geometric mean of empty values");
  }

  return Math.exp(
    values.reduce((sum, value) => sum + Math.log(value), 0) / values.length,
  );
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatRatio(value: number): string {
  return `${round(value, 4)}x (${formatPercent((value - 1) * 100)})`;
}

function formatPercent(value: number): string {
  const rounded = round(value, 2);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

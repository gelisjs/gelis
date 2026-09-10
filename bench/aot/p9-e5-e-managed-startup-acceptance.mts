import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROUTES = 5_000;
const SAMPLES_PER_ORIENTATION = 31;
const READY_MAX = 1.05;

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = resolve(HERE, "p9-e5-e-managed-startup-worker.mts");

type Scenario = "normal" | "aot";

interface GeneratedScenario {
  readonly modulePath: string;
  readonly moduleBytes: number;
  readonly artifactBytes: number;
}

interface WorkerResult {
  readonly scenario: Scenario;
  readonly readyMs: number;
  readonly firstFetchUs: number;
  readonly rssMb: number;
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
const root = readRoot(args, "--root=", ".");
const generatedRoot = await mkdtemp(join(tmpdir(), "gelis-p9-e5-e-startup-"));

try {
  const source = createManagedSource(root);
  const normal = await generateNormal(source);
  const aot = await generateAot(source);

  console.log("\nP9-E5-E managed AOT startup usefulness acceptance\n");
  console.log(`Runtime:             bun ${Bun.version}`);
  console.log(`CPU:                 ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`Routes:              ${ROUTES} managed JSON POST routes`);
  console.log(`Samples/orientation: ${SAMPLES_PER_ORIENTATION}`);
  console.log("Isolation:           fresh Bun process per scenario/sample");
  console.log("Orientations:        normal→AOT and AOT→normal");
  console.log("Build time:          excluded from module-ready measurement");
  console.log(
    `Gate:                AOT ready / normal ready <= ${READY_MAX}x\n`,
  );

  const normalFirstRatios: number[] = [];
  const aotFirstRatios: number[] = [];
  const mirroredRatios: number[] = [];
  const firstFetchRatios: number[] = [];
  const rssRatios: number[] = [];

  for (let sample = 0; sample < SAMPLES_PER_ORIENTATION; sample++) {
    const normalFirstNormal = await runWorker(normal, "normal");
    const normalFirstAot = await runWorker(aot, "aot");
    const aotFirstAot = await runWorker(aot, "aot");
    const aotFirstNormal = await runWorker(normal, "normal");

    const normalFirst = normalFirstAot.readyMs / normalFirstNormal.readyMs;
    const aotFirst = aotFirstAot.readyMs / aotFirstNormal.readyMs;
    const mirrored = Math.sqrt(normalFirst * aotFirst);

    normalFirstRatios.push(normalFirst);
    aotFirstRatios.push(aotFirst);
    mirroredRatios.push(mirrored);

    const firstNormalFirst =
      normalFirstAot.firstFetchUs / normalFirstNormal.firstFetchUs;
    const firstAotFirst =
      aotFirstAot.firstFetchUs / aotFirstNormal.firstFetchUs;
    firstFetchRatios.push(Math.sqrt(firstNormalFirst * firstAotFirst));

    const rssNormalFirst = normalFirstAot.rssMb / normalFirstNormal.rssMb;
    const rssAotFirst = aotFirstAot.rssMb / aotFirstNormal.rssMb;
    rssRatios.push(Math.sqrt(rssNormalFirst * rssAotFirst));

    console.log(
      [
        `sample ${sample + 1}/${SAMPLES_PER_ORIENTATION}`,
        `ready ${formatRatio(mirrored)}`,
        `first ${formatRatio(firstFetchRatios.at(-1)!)}`,
        `rss ${formatRatio(rssRatios.at(-1)!)}`,
      ].join(" | "),
    );
  }

  const readyRatio = median(mirroredRatios);
  const normalFirstRatio = median(normalFirstRatios);
  const aotFirstRatio = median(aotFirstRatios);
  const firstFetchRatio = median(firstFetchRatios);
  const rssRatio = median(rssRatios);

  console.log("\nP9-E5-E managed startup summary\n");
  console.table([
    {
      "normal module KB": round(normal.moduleBytes / 1024, 1),
      "AOT module KB": round(aot.moduleBytes / 1024, 1),
      "AOT artifact KB": round(aot.artifactBytes / 1024, 1),
      "ready ratio": round(readyRatio, 4),
      "normal-first": round(normalFirstRatio, 4),
      "AOT-first": round(aotFirstRatio, 4),
      "first-fetch ratio": round(firstFetchRatio, 4),
      "rss ratio": round(rssRatio, 4),
      gate: `<= ${READY_MAX}x`,
      verdict: readyRatio <= READY_MAX ? "PASS" : "FAIL",
    },
  ]);

  console.log(
    "\nFirst-fetch and RSS ratios are diagnostic for this gate; request-path parity is decided by the dedicated persistent-worker acceptance.",
  );

  if (readyRatio > READY_MAX) {
    throw new Error("P9-E5-E managed startup usefulness gate failed");
  }

  console.log("\nVerdict: PASS");
} finally {
  await rm(generatedRoot, { recursive: true, force: true });
}

function createManagedSource(root: string): string {
  const gelisImport = pathToFileURL(resolve(root, "src/app.ts")).href;
  const lines = [
    `import { Gelis } from ${JSON.stringify(gelisImport)};`,
    "",
    "const Body = {",
    '  "~standard": {',
    "    version: 1,",
    '    vendor: "gelis-p9-e5-e",',
    "    validate(value) {",
    "      return { value };",
    "    },",
    "  },",
    "};",
    "",
    'const response = new Response("ok");',
    "const app = new Gelis();",
    "",
  ];

  for (let index = 0; index < ROUTES; index++) {
    lines.push(`app.post("/r/${index}", { body: Body }, () => response);`);
  }

  lines.push("", "export default app;", "");
  return lines.join("\n");
}

async function generateNormal(source: string): Promise<GeneratedScenario> {
  const modulePath = resolve(generatedRoot, "normal", "application.mts");
  await atomicWriteFile(modulePath, source);
  const moduleStats = await stat(modulePath);

  return {
    modulePath,
    moduleBytes: moduleStats.size,
    artifactBytes: 0,
  };
}

async function generateAot(source: string): Promise<GeneratedScenario> {
  const writerModule = (await import(
    pathToFileURL(resolve(root, "src/tooling/flat-aot-build-writer.ts")).href
  )) as {
    readonly writeFlatAotBuildOutput: WriteFlatAotBuildOutput;
  };

  const modulePath = resolve(generatedRoot, "aot", "application.mts");
  const runtimeAdapterImport = pathToFileURL(
    resolve(root, "src/runtime/flat-aot-runtime-adapter.ts"),
  ).href;

  const output = await writerModule.writeFlatAotBuildOutput(source, {
    modulePath,
    runtimeAdapterImport,
    host: {
      writeTextFileAtomically: atomicWriteFile,
    },
    compileOptions: {
      fileName: "p9-e5-e-managed-startup.mts",
    },
  });

  if (output.artifactPath === undefined) {
    throw new Error("Missing P9-E5-E managed startup artifact");
  }

  const [moduleStats, artifactStats] = await Promise.all([
    stat(modulePath),
    stat(output.artifactPath),
  ]);

  return {
    modulePath,
    moduleBytes: moduleStats.size,
    artifactBytes: artifactStats.size,
  };
}

async function runWorker(
  generated: GeneratedScenario,
  scenario: Scenario,
): Promise<WorkerResult> {
  const child = Bun.spawn([process.execPath, WORKER], {
    env: {
      ...process.env,
      MODULE_PATH: generated.modulePath,
      SCENARIO: scenario,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  const exit = await child.exited;

  if (exit !== 0) {
    throw new Error(`P9-E5-E managed startup worker failed\n${stderr}`);
  }

  const line = stdout.trim().split(/\r?\n/).at(-1);

  if (!line) {
    throw new Error("P9-E5-E managed startup worker produced no result");
  }

  return JSON.parse(line) as WorkerResult;
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

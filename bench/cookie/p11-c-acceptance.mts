import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const WORKER = resolve(HERE, "p11-c-worker.mts");

const SAMPLE_COUNT = 15;
const UNSIGNED_PER_CASE_GATE = 1.1;
const UNSIGNED_GEOMEAN_GATE = 1.05;
const SIGNED_PER_CASE_GATE = 1.15;

type Framework = "gelis" | "hono";
type Scenario =
  | "get-8"
  | "get-32"
  | "generate-basic"
  | "generate-rich"
  | "signed-generate"
  | "signed-verify";

interface CaseDefinition {
  readonly scenario: Scenario;
  readonly category: "unsigned" | "signed";
  readonly gate: number;
}

const cases: readonly CaseDefinition[] = [
  { scenario: "get-8", category: "unsigned", gate: UNSIGNED_PER_CASE_GATE },
  { scenario: "get-32", category: "unsigned", gate: UNSIGNED_PER_CASE_GATE },
  {
    scenario: "generate-basic",
    category: "unsigned",
    gate: UNSIGNED_PER_CASE_GATE,
  },
  {
    scenario: "generate-rich",
    category: "unsigned",
    gate: UNSIGNED_PER_CASE_GATE,
  },
  {
    scenario: "signed-generate",
    category: "signed",
    gate: SIGNED_PER_CASE_GATE,
  },
  {
    scenario: "signed-verify",
    category: "signed",
    gate: SIGNED_PER_CASE_GATE,
  },
];

console.log("P11-C Cookie Capability Acceptance");
console.log(`Bun:       ${Bun.version}`);
console.log(`CPU:       ${cpus()[0]?.model ?? "unknown"}`);
console.log(`Hono:      pinned package dependency`);
console.log(`Samples:   ${SAMPLE_COUNT} mirrored fresh-process pairs`);
console.log(
  "Semantics: public helper calls only; router setup is outside timed loops\n",
);

const rows: CaseResult[] = [];

for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
  const definition = cases[caseIndex]!;
  console.log(
    `[${caseIndex + 1}/${cases.length}] ${definition.scenario} (${definition.category})`,
  );

  rows.push(await runCase(definition));
}

console.log("\nCookie comparison\n");
console.log(
  "| scenario | category | Gelis ns/op | Hono ns/op | Gelis/Hono | Hono-first | Gelis-first | gate |",
);
console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");

for (const row of rows) {
  console.log(
    `| ${row.scenario} | ${row.category} | ${format(row.gelisNs)} | ${format(row.honoNs)} | ${formatRatio(row.ratio)} | ${formatRatio(row.honoFirstRatio)} | ${formatRatio(row.gelisFirstRatio)} | ${row.pass ? "PASS" : "FAIL"} |`,
  );
}

const unsignedRows = rows.filter((row) => row.category === "unsigned");
const unsignedGeomean = geometricMean(unsignedRows.map((row) => row.ratio));
const unsignedGeomeanPass = unsignedGeomean <= UNSIGNED_GEOMEAN_GATE;
const allCasePass = rows.every((row) => row.pass);
const accepted = allCasePass && unsignedGeomeanPass;

console.log(
  `\nUnsigned geomean: ${formatRatio(unsignedGeomean)} <= ${UNSIGNED_GEOMEAN_GATE.toFixed(2)}x => ${unsignedGeomeanPass ? "PASS" : "FAIL"}`,
);
console.log(`\nP11-C ACCEPTANCE: ${accepted ? "PASS" : "FAIL"}`);

if (!accepted) {
  process.exitCode = 1;
}

interface WorkerResult {
  readonly framework: Framework;
  readonly scenario: Scenario;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
}

interface PairSample {
  readonly gelis: WorkerResult;
  readonly hono: WorkerResult;
  readonly order: "hono-first" | "gelis-first";
}

interface CaseResult {
  readonly scenario: Scenario;
  readonly category: "unsigned" | "signed";
  readonly gelisNs: number;
  readonly honoNs: number;
  readonly ratio: number;
  readonly honoFirstRatio: number;
  readonly gelisFirstRatio: number;
  readonly pass: boolean;
}

async function runCase(definition: CaseDefinition): Promise<CaseResult> {
  const samples: PairSample[] = [];

  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const honoFirst = sample % 2 === 0;
    const first: Framework = honoFirst ? "hono" : "gelis";
    const second: Framework = honoFirst ? "gelis" : "hono";

    const firstResult = await runWorker(first, definition.scenario);
    const secondResult = await runWorker(second, definition.scenario);

    const gelis = first === "gelis" ? firstResult : secondResult;
    const hono = first === "hono" ? firstResult : secondResult;

    samples.push({
      gelis,
      hono,
      order: honoFirst ? "hono-first" : "gelis-first",
    });
  }

  const gelisNs = median(samples.map((sample) => sample.gelis.nsPerOp));
  const honoNs = median(samples.map((sample) => sample.hono.nsPerOp));
  const ratios = samples.map(
    (sample) => sample.gelis.nsPerOp / sample.hono.nsPerOp,
  );
  const ratio = median(ratios);
  const honoFirstRatio = median(
    samples
      .filter((sample) => sample.order === "hono-first")
      .map((sample) => sample.gelis.nsPerOp / sample.hono.nsPerOp),
  );
  const gelisFirstRatio = median(
    samples
      .filter((sample) => sample.order === "gelis-first")
      .map((sample) => sample.gelis.nsPerOp / sample.hono.nsPerOp),
  );

  return {
    scenario: definition.scenario,
    category: definition.category,
    gelisNs,
    honoNs,
    ratio,
    honoFirstRatio,
    gelisFirstRatio,
    pass: ratio <= definition.gate,
  };
}

async function runWorker(
  framework: Framework,
  scenario: Scenario,
): Promise<WorkerResult> {
  const child = Bun.spawn(
    [
      process.execPath,
      WORKER,
      `--framework=${framework}`,
      `--scenario=${scenario}`,
    ],
    {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  const exitCode = await child.exited;
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      [
        `P11-C benchmark worker failed: ${framework}/${scenario}`,
        stdout,
        stderr,
      ].join("\n"),
    );
  }

  const lines = stdout
    .trim()
    .split(/\r?\n/u)
    .filter((line) => line.length > 0);
  const lastLine = lines.at(-1);

  if (lastLine === undefined) {
    throw new Error(`P11-C worker emitted no JSON: ${framework}/${scenario}`);
  }

  const parsed: unknown = JSON.parse(lastLine);
  if (!isWorkerResult(parsed, framework, scenario)) {
    throw new Error(`Invalid P11-C worker result: ${lastLine}`);
  }

  return parsed;
}

function isWorkerResult(
  value: unknown,
  framework: Framework,
  scenario: Scenario,
): value is WorkerResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "framework" in value &&
    value.framework === framework &&
    "scenario" in value &&
    value.scenario === scenario &&
    "iterations" in value &&
    typeof value.iterations === "number" &&
    value.iterations > 0 &&
    "warmups" in value &&
    typeof value.warmups === "number" &&
    value.warmups > 0 &&
    "nsPerOp" in value &&
    typeof value.nsPerOp === "number" &&
    Number.isFinite(value.nsPerOp) &&
    value.nsPerOp > 0 &&
    "sink" in value &&
    typeof value.sink === "number"
  );
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute median of an empty sample set");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[midpoint]!;
  }

  return (sorted[midpoint - 1]! + sorted[midpoint]!) / 2;
}

function geometricMean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute geometric mean of an empty set");
  }

  return Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) / values.length,
  );
}

function format(value: number): string {
  return value.toFixed(1);
}

function formatRatio(value: number): string {
  return `${value.toFixed(4)}x`;
}

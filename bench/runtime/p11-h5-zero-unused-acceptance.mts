import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const WORKER = resolve(HERE, "p11-h5-zero-unused-worker.mts");

const CONTROL_SHA = "0df4f1e20bef3e9fa7c9a554be022bc241536424";
const CANDIDATE_SHA = "1dd5f94cf0e9ad884ca44e537ee287587cd8baab";
const REQUIRED_BUN_VERSION = "1.4.0";
const SAMPLE_COUNT = 11;
const CASE_GATE = 1.03;
const GEOMEAN_GATE = 1.015;

type ZeroScenario =
  "static-raw" | "dynamic-raw" | "static-json" | "dynamic-json";

interface WorkerResult {
  readonly mode: "zero-unused";
  readonly framework: "gelis";
  readonly scenario: ZeroScenario;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
  readonly routes: number;
}

interface PairedResult {
  readonly controlNs: number;
  readonly candidateNs: number;
  readonly ratio: number;
  readonly controlFirstRatio: number;
  readonly candidateFirstRatio: number;
}

interface RuntimeRouteRecordProbe {
  readonly flags: number;
  readonly [key: symbol]: unknown;
}

const options = readOptions(process.argv.slice(2));
const controlRoot = resolve(ROOT, options.controlRoot);
const candidateRoot = resolve(ROOT, options.candidateRoot);

if (Bun.version !== REQUIRED_BUN_VERSION) {
  throw new Error(
    `P11-H5 requires Bun ${REQUIRED_BUN_VERSION}, received ${Bun.version}`,
  );
}

const controlSha = gitHead(controlRoot);
const candidateSha = gitHead(candidateRoot);

if (controlSha !== CONTROL_SHA) {
  throw new Error(
    `P11-H5 control must be ${CONTROL_SHA}, received ${controlSha}`,
  );
}

if (candidateSha !== CANDIDATE_SHA) {
  throw new Error(
    `P11-H5 candidate must be ${CANDIDATE_SHA}, received ${candidateSha}`,
  );
}

assertCleanWorkingTree(controlRoot, "control");
assertCleanWorkingTree(candidateRoot, "candidate");
await assertZeroUnusedStructure(candidateRoot);

console.log("P11-H5 cumulative zero-unused acceptance");
console.log(`Bun:       ${Bun.version}`);
console.log(`CPU:       ${cpus()[0]?.model ?? "unknown"}`);
console.log(`Control:   ${controlSha}`);
console.log(`Candidate: ${candidateSha}`);
console.log("Routes:    5,000 mixed plain routes");
console.log(`Samples:   ${SAMPLE_COUNT} mirrored fresh-process pairs`);
console.log("Structure: cumulative zero-unused assertions PASS\n");

const scenarios: readonly ZeroScenario[] = [
  "static-raw",
  "dynamic-raw",
  "static-json",
  "dynamic-json",
];

console.log("Zero-unused regression vs frozen P11-B control");
console.log(
  "| scenario | control ns/op | candidate ns/op | candidate/control | control-first | candidate-first | gate |",
);
console.log("| --- | ---: | ---: | ---: | ---: | ---: | --- |");

let accepted = true;
const ratios: number[] = [];

for (const scenario of scenarios) {
  const result = await runMirroredRoots(scenario, controlRoot, candidateRoot);
  const pass = result.ratio <= CASE_GATE;

  ratios.push(result.ratio);
  accepted &&= pass;

  console.log(
    `| ${scenario} | ${formatNs(result.controlNs)} | ${formatNs(result.candidateNs)} | ${formatRatio(result.ratio)} | ${formatRatio(result.controlFirstRatio)} | ${formatRatio(result.candidateFirstRatio)} | ${pass ? "PASS" : "FAIL"} |`,
  );
}

const geomean = geometricMean(ratios);
const geomeanPass = geomean <= GEOMEAN_GATE;
accepted &&= geomeanPass;

console.log(
  `\nZero-unused geomean: ${formatRatio(geomean)} <= ${GEOMEAN_GATE.toFixed(3)}x => ${geomeanPass ? "PASS" : "FAIL"}`,
);
console.log(`\nP11-H5 ACCEPTANCE: ${accepted ? "PASS" : "FAIL"}`);

if (!accepted) {
  process.exitCode = 1;
}

async function assertZeroUnusedStructure(candidate: string): Promise<void> {
  const applicationHttp = (await importSource(
    candidate,
    "src/runtime/application-http.ts",
  )) as {
    extractApplicationHttpPlan(hooks: readonly unknown[] | undefined): {
      readonly plan: unknown;
    };
  };

  const emptyExtraction = applicationHttp.extractApplicationHttpPlan(undefined);
  if (emptyExtraction.plan !== undefined) {
    throw new Error(
      "P11-H5 structural failure: no-capability application compiled an HTTP plan",
    );
  }

  const application = (await importSource(
    candidate,
    "src/runtime/application.ts",
  )) as {
    compileApplicationFetch(
      routedFetch: (request: Request) => Response,
      onRequestHooks: readonly unknown[] | undefined,
      onErrorHooks: readonly unknown[] | undefined,
    ): (request: Request) => Response | Promise<Response>;
  };

  const routedFetch = (_request: Request) => new Response("ok");
  const compiledFetch = application.compileApplicationFetch(
    routedFetch,
    undefined,
    undefined,
  );

  if (compiledFetch !== routedFetch) {
    throw new Error(
      "P11-H5 structural failure: zero-unused application added a fetch wrapper",
    );
  }

  const runtimeTypes = (await importSource(
    candidate,
    "src/runtime/types.ts",
  )) as {
    RUNTIME_ROUTE_PLAIN: number;
    RUNTIME_ROUTE_TIMEOUT_PLAN: symbol;
  };

  const routeBuilderModule = (await importSource(
    candidate,
    "src/route-builder.ts",
  )) as {
    RouteBuilder: new (
      prefix: string,
      register: (route: RuntimeRouteRecordProbe) => void,
    ) => {
      get(path: string, handler: () => Response): unknown;
    };
  };

  let capturedRoute: RuntimeRouteRecordProbe | undefined;
  const builder = new routeBuilderModule.RouteBuilder("", (route) => {
    capturedRoute = route;
  });

  builder.get("/p11-h5-plain", () => new Response("ok"));

  if (capturedRoute === undefined) {
    throw new Error(
      "P11-H5 structural failure: plain route registration produced no runtime route",
    );
  }

  if (capturedRoute.flags !== runtimeTypes.RUNTIME_ROUTE_PLAIN) {
    throw new Error(
      `P11-H5 structural failure: plain route flags were ${capturedRoute.flags}`,
    );
  }

  if (runtimeTypes.RUNTIME_ROUTE_TIMEOUT_PLAN in capturedRoute) {
    throw new Error(
      "P11-H5 structural failure: plain route unexpectedly owns timeout state",
    );
  }

  const runtimeInput = (await importSource(
    candidate,
    "src/runtime/input.ts",
  )) as {
    createRuntimeInputPlan(options: { readonly body: unknown }):
      | {
          readonly bodyLimit?: number;
          readonly readBody?: (request: Request) => unknown | Promise<unknown>;
        }
      | undefined;
  };

  const passthroughSchema = {
    "~standard": {
      version: 1,
      vendor: "p11-h5",
      validate: (value: unknown) => ({ value }),
    },
  };

  const inputPlan = runtimeInput.createRuntimeInputPlan({
    body: passthroughSchema,
  });

  if (inputPlan === undefined || inputPlan.bodyLimit !== undefined) {
    throw new Error(
      "P11-H5 structural failure: managed body route without a limit gained body-limit state",
    );
  }

  if (typeof inputPlan.readBody !== "function") {
    throw new Error(
      "P11-H5 structural failure: default managed body reader was not preserved",
    );
  }

  const parsed = await inputPlan.readBody(
    new Request("http://gelis.test/p11-h5-body", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    }),
  );

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("ok" in parsed) ||
    parsed.ok !== true
  ) {
    throw new Error(
      "P11-H5 structural failure: default managed body reader behavior changed",
    );
  }
}

async function importSource(root: string, path: string): Promise<unknown> {
  return await import(pathToFileURL(resolve(root, path)).href);
}

async function runMirroredRoots(
  scenario: ZeroScenario,
  control: string,
  candidate: string,
): Promise<PairedResult> {
  const pairs: Array<{
    control: WorkerResult;
    candidate: WorkerResult;
    controlFirst: boolean;
  }> = [];

  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const controlFirst = sample % 2 === 0;

    const first = await runWorker([
      `--scenario=${scenario}`,
      `--root=${controlFirst ? control : candidate}`,
    ]);
    const second = await runWorker([
      `--scenario=${scenario}`,
      `--root=${controlFirst ? candidate : control}`,
    ]);

    pairs.push({
      control: controlFirst ? first : second,
      candidate: controlFirst ? second : first,
      controlFirst,
    });
  }

  const pairRatios = pairs.map(
    (pair) => pair.candidate.nsPerOp / pair.control.nsPerOp,
  );
  const controlFirstRatios = pairs
    .filter((pair) => pair.controlFirst)
    .map((pair) => pair.candidate.nsPerOp / pair.control.nsPerOp);
  const candidateFirstRatios = pairs
    .filter((pair) => !pair.controlFirst)
    .map((pair) => pair.candidate.nsPerOp / pair.control.nsPerOp);

  return {
    controlNs: median(pairs.map((pair) => pair.control.nsPerOp)),
    candidateNs: median(pairs.map((pair) => pair.candidate.nsPerOp)),
    ratio: median(pairRatios),
    controlFirstRatio: median(controlFirstRatios),
    candidateFirstRatio: median(candidateFirstRatios),
  };
}

async function runWorker(args: readonly string[]): Promise<WorkerResult> {
  const child = Bun.spawn([process.execPath, WORKER, ...args], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  const exitCode = await child.exited;
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      ["P11-H5 benchmark worker failed", ...args, stdout, stderr].join("\n"),
    );
  }

  const lines = stdout
    .trim()
    .split(/\r?\n/u)
    .filter((line) => line.length > 0);
  const last = lines.at(-1);

  if (last === undefined) {
    throw new Error("P11-H5 benchmark worker emitted no JSON");
  }

  const parsed: unknown = JSON.parse(last);
  if (!isWorkerResult(parsed)) {
    throw new Error(`Invalid P11-H5 worker result: ${last}`);
  }

  return parsed;
}

function isWorkerResult(value: unknown): value is WorkerResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "mode" in value &&
    value.mode === "zero-unused" &&
    "framework" in value &&
    value.framework === "gelis" &&
    "scenario" in value &&
    typeof value.scenario === "string" &&
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
    typeof value.sink === "number" &&
    "routes" in value &&
    value.routes === 5_000
  );
}

interface Options {
  readonly controlRoot: string;
  readonly candidateRoot: string;
}

function readOptions(values: readonly string[]): Options {
  let controlRoot: string | undefined;
  let candidateRoot: string | undefined;

  for (const value of values) {
    if (value.startsWith("--control-root=")) {
      controlRoot = value.slice("--control-root=".length);
    } else if (value.startsWith("--candidate-root=")) {
      candidateRoot = value.slice("--candidate-root=".length);
    }
  }

  if (controlRoot === undefined || controlRoot.length === 0) {
    throw new Error("P11-H5 benchmark requires --control-root=<path>");
  }

  if (candidateRoot === undefined || candidateRoot.length === 0) {
    throw new Error("P11-H5 benchmark requires --candidate-root=<path>");
  }

  return { controlRoot, candidateRoot };
}

function gitHead(root: string): string {
  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }

  return new TextDecoder().decode(result.stdout).trim();
}

function assertCleanWorkingTree(root: string, label: string): void {
  const result = Bun.spawnSync(["git", "status", "--porcelain"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }

  const status = new TextDecoder().decode(result.stdout).trim();
  if (status.length !== 0) {
    throw new Error(`P11-H5 ${label} worktree must be clean:\n${status}`);
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute median of empty P11-H5 sample set");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[midpoint]!
    : (sorted[midpoint - 1]! + sorted[midpoint]!) / 2;
}

function geometricMean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute geometric mean of empty P11-H5 set");
  }

  return Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) / values.length,
  );
}

function formatNs(value: number): string {
  return value.toFixed(1);
}

function formatRatio(value: number): string {
  return `${value.toFixed(4)}x`;
}

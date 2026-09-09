import { execFileSync, spawn } from "node:child_process";

import { cpus } from "node:os";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONTROL_SHA = "24f58c6d365ef99aa7d7196561bde068fc8fb92e";

const SAMPLES = 41;
const MAX_DELTA_PERCENT = 3;

type Workload = "body-json" | "query-body-json";

interface WorkerClient {
  readonly measure: () => Promise<number>;
  readonly close: () => Promise<void>;
}

interface Sample {
  readonly order: "control-start" | "candidate-start";
  readonly deltaPercent: number;
}

const args = process.argv.slice(2);

const controlRoot = readRoot(args, "--control-root=");

const candidateRoot = readRoot(args, "--candidate-root=", ".");

const allowSameHead = args.includes("--allow-same-head");

const controlHead = gitHead(controlRoot);
const candidateHead = gitHead(candidateRoot);

if (controlHead !== CONTROL_SHA) {
  throw new Error(`Control is at ${controlHead}; expected ${CONTROL_SHA}`);
}

const candidateDirty = gitStatus(candidateRoot) !== "";

if (!allowSameHead && candidateHead === controlHead && !candidateDirty) {
  throw new Error(
    "Candidate equals clean control; use --allow-same-head only for A/A calibration",
  );
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const workerPath = resolve(
  currentDirectory,
  "request-body-reader-process-worker.mts",
);

console.log("\nP9-E2-B request body reader process-isolated acceptance\n");

console.log(`Runtime:        bun ${Bun.version}`);
console.log(`CPU:            ${cpus()[0]?.model ?? "unknown"}`);
console.log(`Samples:        ${SAMPLES} mirrored samples`);
console.log(`Control SHA:    ${controlHead}`);
console.log(`Candidate HEAD: ${candidateHead}`);
console.log(`Candidate dirty:${candidateDirty ? " yes" : " no"}`);
console.log("Isolation:      one Gelis module graph per Bun process");
console.log("Workers:        four persistent workers/workload");
console.log("Orientations:   control/candidate + candidate/control");
console.log("Pair shape:     semantic ABBA / BAAB");
console.log("Routes:         5,000 POST routes");
console.log("Warmup:         10,000 async app.fetch calls/worker");
console.log("Measurement:    20,000 async app.fetch calls/measurement");
console.log(
  "Body source:    stable Request-like object; json() returns Promise.resolve(payload)",
);
console.log("GC:             Bun.gc(true) inside measured worker");
console.log(
  "Combine:        geometric mean of canonical candidate/control ratios",
);
console.log(
  `Gate:           mirrored median delta <= +${MAX_DELTA_PERCENT}% per workload`,
);
console.log("Order buckets:  diagnostic only");

const results = [];

for (const workload of ["body-json", "query-body-json"] as const) {
  results.push(await runWorkload(workload));
}

console.log("\nP9-E2-B process-isolated acceptance summary\n");

console.table(
  results.map((result) => ({
    workload: result.workload,
    "mirrored Δ %": round(result.mirroredMedianDelta, 2),
    "control-start Δ %": round(result.controlStartMedianDelta, 2),
    "candidate-start Δ %": round(result.candidateStartMedianDelta, 2),
    gate: `<= +${MAX_DELTA_PERCENT}%`,
    verdict: result.pass ? "PASS" : "FAIL",
  })),
);

const failed = results.filter((result) => !result.pass);

if (failed.length !== 0) {
  throw new Error(
    `P9-E2-B request body reader gate failed: ${failed
      .map((result) => result.workload)
      .join(", ")}`,
  );
}

console.log("\nVerdict: PASS");

async function runWorkload(workload: Workload): Promise<{
  readonly workload: Workload;
  readonly mirroredMedianDelta: number;
  readonly controlStartMedianDelta: number;
  readonly candidateStartMedianDelta: number;
  readonly pass: boolean;
}> {
  console.log(`\n--- ${workload} ---`);

  const controlOne = await createWorker(controlRoot, workload);

  const candidateOne = await createWorker(candidateRoot, workload);

  const candidateTwo = await createWorker(candidateRoot, workload);

  const controlTwo = await createWorker(controlRoot, workload);

  const samples: Sample[] = [];

  try {
    for (let sample = 0; sample < SAMPLES; sample++) {
      const controlStart = sample % 2 === 0;

      let ratioOne: number;
      let ratioTwo: number;

      if (sample % 2 === 0) {
        ratioOne = await measureOrientation(
          controlOne,
          candidateOne,
          controlStart,
        );

        ratioTwo = await measureOrientation(
          controlTwo,
          candidateTwo,
          controlStart,
        );
      } else {
        ratioTwo = await measureOrientation(
          controlTwo,
          candidateTwo,
          controlStart,
        );

        ratioOne = await measureOrientation(
          controlOne,
          candidateOne,
          controlStart,
        );
      }

      const mirroredRatio = Math.sqrt(ratioOne * ratioTwo);

      const deltaPercent = (mirroredRatio - 1) * 100;

      samples.push({
        order: controlStart ? "control-start" : "candidate-start",
        deltaPercent,
      });

      console.log(
        `sample ${String(sample + 1).padStart(2, "0")}/${SAMPLES} | ${
          controlStart ? "C-start" : "N-start"
        } | mirrored Δ ${formatPercent(deltaPercent)}`,
      );
    }
  } finally {
    await Promise.all([
      controlOne.close(),
      candidateOne.close(),
      candidateTwo.close(),
      controlTwo.close(),
    ]);
  }

  const mirroredMedianDelta = median(
    samples.map((sample) => sample.deltaPercent),
  );

  const controlStartMedianDelta = median(
    samples
      .filter((sample) => sample.order === "control-start")
      .map((sample) => sample.deltaPercent),
  );

  const candidateStartMedianDelta = median(
    samples
      .filter((sample) => sample.order === "candidate-start")
      .map((sample) => sample.deltaPercent),
  );

  const pass = mirroredMedianDelta <= MAX_DELTA_PERCENT;

  console.table([
    {
      workload,
      "mirrored median Δ %": round(mirroredMedianDelta, 2),
      "control-start Δ %": round(controlStartMedianDelta, 2),
      "candidate-start Δ %": round(candidateStartMedianDelta, 2),
      verdict: pass ? "PASS" : "FAIL",
    },
  ]);

  return {
    workload,
    mirroredMedianDelta,
    controlStartMedianDelta,
    candidateStartMedianDelta,
    pass,
  };
}

async function measureOrientation(
  control: WorkerClient,
  candidate: WorkerClient,
  controlStart: boolean,
): Promise<number> {
  let controlFirst: number;
  let controlSecond: number;
  let candidateFirst: number;
  let candidateSecond: number;

  if (controlStart) {
    controlFirst = await control.measure();
    candidateFirst = await candidate.measure();
    candidateSecond = await candidate.measure();
    controlSecond = await control.measure();
  } else {
    candidateFirst = await candidate.measure();
    controlFirst = await control.measure();
    controlSecond = await control.measure();
    candidateSecond = await candidate.measure();
  }

  const controlNs = (controlFirst + controlSecond) / 2;

  const candidateNs = (candidateFirst + candidateSecond) / 2;

  return candidateNs / controlNs;
}

async function createWorker(
  root: string,
  workload: Workload,
): Promise<WorkerClient> {
  const child = spawn(
    process.execPath,
    [workerPath, `--root=${root}`, `--workload=${workload}`],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "inherit"],
    },
  );

  if (child.stdin === null || child.stdout === null) {
    throw new Error("Failed to create worker pipes");
  }

  const input = child.stdin;

  const output = createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });

  const lines: string[] = [];

  const waiters: Array<(line: string) => void> = [];

  output.on("line", (line) => {
    const waiter = waiters.shift();

    if (waiter !== undefined) {
      waiter(line);
      return;
    }

    lines.push(line);
  });

  const exitPromise = new Promise<void>((resolveExit, rejectExit) => {
    child.once("error", rejectExit);

    child.once("exit", (code) => {
      if (code === 0 || code === null) {
        resolveExit();
        return;
      }

      rejectExit(new Error(`Worker exited with code ${code}`));
    });
  });

  const nextLine = (): Promise<string> => {
    const existing = lines.shift();

    if (existing !== undefined) {
      return Promise.resolve(existing);
    }

    return new Promise((resolveLine) => {
      waiters.push(resolveLine);
    });
  };

  const ready = JSON.parse(await nextLine()) as {
    readonly type?: string;
  };

  if (ready.type !== "ready") {
    throw new Error("Worker did not become ready");
  }

  let closed = false;

  return {
    measure: async () => {
      if (closed) {
        throw new Error("Worker is already closed");
      }

      input.write("measure\n");

      const message = JSON.parse(await nextLine()) as {
        readonly type?: string;
        readonly ns?: number;
      };

      if (message.type !== "measurement" || typeof message.ns !== "number") {
        throw new Error("Invalid worker measurement");
      }

      return message.ns;
    },

    close: async () => {
      if (closed) {
        return;
      }

      closed = true;

      input.write("close\n");
      input.end();

      await exitPromise;
    },
  };
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

  if (sorted.length % 2 === 1) {
    return sorted[middle]!;
  }

  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function formatPercent(value: number): string {
  const rounded = round(value, 2);

  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

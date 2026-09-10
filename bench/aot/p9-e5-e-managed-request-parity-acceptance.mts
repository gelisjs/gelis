import { execFileSync, spawn } from "node:child_process";
import { cpus } from "node:os";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLES = 41;
const MAX_DELTA_PERCENT = 3;

type Workload = "json" | "query-json" | "multipart";
type Scenario = "normal" | "aot";

interface WorkerClient {
  readonly measure: () => Promise<number>;
  readonly close: () => Promise<void>;
}

interface Sample {
  readonly order: "normal-start" | "aot-start";
  readonly deltaPercent: number;
}

const args = process.argv.slice(2);
const root = readRoot(args, "--root=", ".");
const head = gitHead(root);
const dirty = gitStatus(root) !== "";
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const workerPath = resolve(
  currentDirectory,
  "p9-e5-e-managed-request-parity-worker.mts",
);

console.log("\nP9-E5-E managed request-path parity acceptance\n");
console.log(`Runtime:        bun ${Bun.version}`);
console.log(`CPU:            ${cpus()[0]?.model ?? "unknown"}`);
console.log(`Samples:        ${SAMPLES} mirrored samples`);
console.log(`Candidate HEAD: ${head}`);
console.log(`Candidate dirty:${dirty ? " yes" : " no"}`);
console.log("Workloads:      JSON shorthand, query+JSON, multipart");
console.log("Routes:         5,000 POST routes");
console.log("Workers:        four persistent workers/workload");
console.log("Orientations:   normal/AOT + AOT/normal");
console.log("Pair shape:     semantic ABBA / BAAB");
console.log("Warmup:         10,000 async app.fetch calls/worker");
console.log("Measurement:    20,000 async app.fetch calls/measurement");
console.log("GC:             Bun.gc(true) inside measured worker");
console.log("Combine:        geometric mean of mirrored AOT/normal ratios");
console.log(
  `Gate:           mirrored median delta <= +${MAX_DELTA_PERCENT}% per workload`,
);
console.log("Order buckets:  diagnostic only\n");

const results = [];

for (const workload of ["json", "query-json", "multipart"] as const) {
  results.push(await runWorkload(workload));
}

console.log("\nP9-E5-E managed request-path parity summary\n");
console.table(
  results.map((result) => ({
    workload: result.workload,
    "mirrored Δ %": round(result.mirroredMedianDelta, 2),
    "normal-start Δ %": round(result.normalStartMedianDelta, 2),
    "aot-start Δ %": round(result.aotStartMedianDelta, 2),
    gate: `<= +${MAX_DELTA_PERCENT}%`,
    verdict: result.pass ? "PASS" : "FAIL",
  })),
);

const failed = results.filter((result) => !result.pass);

if (failed.length !== 0) {
  throw new Error(
    `P9-E5-E managed request parity gate failed: ${failed
      .map((result) => result.workload)
      .join(", ")}`,
  );
}

console.log("\nVerdict: PASS");

async function runWorkload(workload: Workload): Promise<{
  readonly workload: Workload;
  readonly mirroredMedianDelta: number;
  readonly normalStartMedianDelta: number;
  readonly aotStartMedianDelta: number;
  readonly pass: boolean;
}> {
  console.log(`\n--- ${workload} ---`);

  const normalOne = await createWorker(root, workload, "normal");
  const aotOne = await createWorker(root, workload, "aot");
  const aotTwo = await createWorker(root, workload, "aot");
  const normalTwo = await createWorker(root, workload, "normal");
  const samples: Sample[] = [];

  try {
    for (let sample = 0; sample < SAMPLES; sample++) {
      const normalStart = sample % 2 === 0;
      let ratioOne: number;
      let ratioTwo: number;

      if (sample % 2 === 0) {
        ratioOne = await measureOrientation(normalOne, aotOne, normalStart);
        ratioTwo = await measureOrientation(normalTwo, aotTwo, normalStart);
      } else {
        ratioTwo = await measureOrientation(normalTwo, aotTwo, normalStart);
        ratioOne = await measureOrientation(normalOne, aotOne, normalStart);
      }

      const mirroredRatio = Math.sqrt(ratioOne * ratioTwo);
      const deltaPercent = (mirroredRatio - 1) * 100;

      samples.push({
        order: normalStart ? "normal-start" : "aot-start",
        deltaPercent,
      });

      console.log(
        `sample ${String(sample + 1).padStart(2, "0")}/${SAMPLES} | ${
          normalStart ? "N-start" : "A-start"
        } | mirrored Δ ${formatPercent(deltaPercent)}`,
      );
    }
  } finally {
    await Promise.all([
      normalOne.close(),
      aotOne.close(),
      aotTwo.close(),
      normalTwo.close(),
    ]);
  }

  const mirroredMedianDelta = median(
    samples.map((sample) => sample.deltaPercent),
  );
  const normalStartMedianDelta = median(
    samples
      .filter((sample) => sample.order === "normal-start")
      .map((sample) => sample.deltaPercent),
  );
  const aotStartMedianDelta = median(
    samples
      .filter((sample) => sample.order === "aot-start")
      .map((sample) => sample.deltaPercent),
  );

  return {
    workload,
    mirroredMedianDelta,
    normalStartMedianDelta,
    aotStartMedianDelta,
    pass: mirroredMedianDelta <= MAX_DELTA_PERCENT,
  };
}

async function measureOrientation(
  normal: WorkerClient,
  aot: WorkerClient,
  normalStart: boolean,
): Promise<number> {
  let normalFirst: number;
  let normalSecond: number;
  let aotFirst: number;
  let aotSecond: number;

  if (normalStart) {
    normalFirst = await normal.measure();
    aotFirst = await aot.measure();
    aotSecond = await aot.measure();
    normalSecond = await normal.measure();
  } else {
    aotFirst = await aot.measure();
    normalFirst = await normal.measure();
    normalSecond = await normal.measure();
    aotSecond = await aot.measure();
  }

  const normalNs = (normalFirst + normalSecond) / 2;
  const aotNs = (aotFirst + aotSecond) / 2;
  return aotNs / normalNs;
}

async function createWorker(
  workerRoot: string,
  workload: Workload,
  scenario: Scenario,
): Promise<WorkerClient> {
  const child = spawn(
    process.execPath,
    [
      workerPath,
      `--root=${workerRoot}`,
      `--workload=${workload}`,
      `--scenario=${scenario}`,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "inherit"],
    },
  );

  if (child.stdin === null || child.stdout === null) {
    throw new Error("Failed to create P9-E5-E worker pipes");
  }

  const input = child.stdin;
  const output = createInterface({ input: child.stdout, crlfDelay: Infinity });
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
    readonly workload?: string;
    readonly scenario?: string;
  };

  if (
    ready.type !== "ready" ||
    ready.workload !== workload ||
    ready.scenario !== scenario
  ) {
    throw new Error("P9-E5-E worker did not become ready");
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
        throw new Error("Invalid P9-E5-E worker measurement");
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

function gitHead(rootPath: string): string {
  return execFileSync("git", ["-C", rootPath, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

function gitStatus(rootPath: string): string {
  return execFileSync("git", ["-C", rootPath, "status", "--porcelain"], {
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

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatPercent(value: number): string {
  const rounded = round(value, 2);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

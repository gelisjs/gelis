import { spawn } from "node:child_process";
import { cpus } from "node:os";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLES = 41;
const MAX_DELTA_PERCENT = 5;

type Variant = "manual" | "managed";

interface WorkerClient {
  readonly measure: () => Promise<number>;
  readonly close: () => Promise<void>;
}

interface Sample {
  readonly order: "manual-start" | "managed-start";
  readonly deltaPercent: number;
}

const args = process.argv.slice(2);
const root = readRoot(args, "--root=", ".");

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const workerPath = resolve(
  currentDirectory,
  "request-body-multipart-process-worker.mts",
);

console.log("\nP9-E3-E multipart body reader process-isolated acceptance\n");
console.log(`Runtime:        bun ${Bun.version}`);
console.log(`CPU:            ${cpus()[0]?.model ?? "unknown"}`);
console.log(`Samples:        ${SAMPLES} mirrored samples`);
console.log(`Candidate root: ${root}`);
console.log("Isolation:      one Gelis module graph per Bun process");
console.log("Workers:        four persistent workers");
console.log("Orientations:   manual/managed + managed/manual");
console.log("Pair shape:     semantic ABBA / BAAB");
console.log("Routes:         5,000 POST routes");
console.log("Warmup:         10,000 async app.fetch calls/worker");
console.log("Measurement:    20,000 async app.fetch calls/measurement");
console.log(
  "Body source:    stable Request-like object; formData() returns Promise.resolve(FormData)",
);
console.log(
  "Normalize:      null-prototype scalar/array normalization preserving FormData values",
);
console.log("GC:             Bun.gc(true) inside measured worker");
console.log(
  "Combine:        geometric mean of canonical managed/manual ratios",
);
console.log(
  `Gate:           mirrored median managed/manual delta <= +${MAX_DELTA_PERCENT}%`,
);
console.log("Order buckets:  diagnostic only");

const manualOne = await createWorker(root, "manual");
const managedOne = await createWorker(root, "managed");
const managedTwo = await createWorker(root, "managed");
const manualTwo = await createWorker(root, "manual");

const samples: Sample[] = [];

try {
  for (let sample = 0; sample < SAMPLES; sample++) {
    const manualStart = sample % 2 === 0;

    let ratioOne: number;
    let ratioTwo: number;

    if (sample % 2 === 0) {
      ratioOne = await measureOrientation(manualOne, managedOne, manualStart);
      ratioTwo = await measureOrientation(manualTwo, managedTwo, manualStart);
    } else {
      ratioTwo = await measureOrientation(manualTwo, managedTwo, manualStart);
      ratioOne = await measureOrientation(manualOne, managedOne, manualStart);
    }

    const mirroredRatio = Math.sqrt(ratioOne * ratioTwo);
    const deltaPercent = (mirroredRatio - 1) * 100;

    samples.push({
      order: manualStart ? "manual-start" : "managed-start",
      deltaPercent,
    });

    console.log(
      `sample ${String(sample + 1).padStart(2, "0")}/${SAMPLES} | ${
        manualStart ? "M-start" : "G-start"
      } | mirrored Δ ${formatPercent(deltaPercent)}`,
    );
  }
} finally {
  await Promise.all([
    manualOne.close(),
    managedOne.close(),
    managedTwo.close(),
    manualTwo.close(),
  ]);
}

const mirroredMedianDelta = median(samples.map((sample) => sample.deltaPercent));
const manualStartMedianDelta = median(
  samples
    .filter((sample) => sample.order === "manual-start")
    .map((sample) => sample.deltaPercent),
);
const managedStartMedianDelta = median(
  samples
    .filter((sample) => sample.order === "managed-start")
    .map((sample) => sample.deltaPercent),
);

const pass = mirroredMedianDelta <= MAX_DELTA_PERCENT;

console.log("\nP9-E3-E multipart body reader acceptance summary\n");
console.table([
  {
    workload: "multipart managed/manual",
    "mirrored Δ %": round(mirroredMedianDelta, 2),
    "manual-start Δ %": round(manualStartMedianDelta, 2),
    "managed-start Δ %": round(managedStartMedianDelta, 2),
    gate: `<= +${MAX_DELTA_PERCENT}%`,
    verdict: pass ? "PASS" : "FAIL",
  },
]);

if (!pass) {
  throw new Error("P9-E3-E multipart body reader managed/manual gate failed");
}

console.log("\nVerdict: PASS");

async function measureOrientation(
  manual: WorkerClient,
  managed: WorkerClient,
  manualStart: boolean,
): Promise<number> {
  let manualFirst: number;
  let manualSecond: number;
  let managedFirst: number;
  let managedSecond: number;

  if (manualStart) {
    manualFirst = await manual.measure();
    managedFirst = await managed.measure();
    managedSecond = await managed.measure();
    manualSecond = await manual.measure();
  } else {
    managedFirst = await managed.measure();
    manualFirst = await manual.measure();
    manualSecond = await manual.measure();
    managedSecond = await managed.measure();
  }

  const manualNs = (manualFirst + manualSecond) / 2;
  const managedNs = (managedFirst + managedSecond) / 2;

  return managedNs / manualNs;
}

async function createWorker(
  root: string,
  variant: Variant,
): Promise<WorkerClient> {
  const child = spawn(
    process.execPath,
    [workerPath, `--root=${root}`, `--variant=${variant}`],
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
    readonly variant?: string;
  };

  if (ready.type !== "ready" || ready.variant !== variant) {
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

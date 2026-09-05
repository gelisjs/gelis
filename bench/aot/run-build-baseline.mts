import { mkdirSync, writeFileSync } from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const GENERATED = resolve(HERE, "generated");

const RESULTS = resolve(HERE, "results");

const WORKER = resolve(HERE, "build-worker.mts");

const SIZES = [1, 100, 1000, 5000] as const;

const KINDS = ["static", "dynamic"] as const;

const SAMPLES = 7;

type RouteKind = (typeof KINDS)[number];

interface RawResult {
  routes: number;

  kind: RouteKind;

  sample: number;

  sourceBytes: number;

  buildMs: number;

  processMs: number;

  outputBytes: number;

  outputCount: number;
}

mkdirSync(GENERATED, {
  recursive: true,
});

mkdirSync(RESULTS, {
  recursive: true,
});

const raw: RawResult[] = [];

for (const kind of KINDS) {
  for (const routes of SIZES) {
    const source = generateSource(kind, routes);

    const file = resolve(GENERATED, `${kind}-${routes}.ts`);

    writeFileSync(file, source);

    const sourceBytes = Buffer.byteLength(source, "utf8");

    for (let sample = 0; sample < SAMPLES; sample++) {
      const result = await runBuild(file);

      raw.push({
        routes,

        kind,

        sample,

        sourceBytes,

        ...result,
      });

      console.log(
        [
          kind,
          `${routes} routes`,
          `sample ${sample + 1}/${SAMPLES}`,
          `build ${round(result.buildMs, 2)} ms`,
          `bundle ${formatKb(result.outputBytes)} KB`,
        ].join(" | "),
      );
    }
  }
}

const rows = KINDS.flatMap((kind) =>
  SIZES.map((routes) => {
    const group = raw.filter(
      (result) => result.kind === kind && result.routes === routes,
    );

    const sourceBytes = group[0]?.sourceBytes;

    if (sourceBytes === undefined) {
      throw new Error("Missing build group");
    }

    const outputBytes = median(group.map((result) => result.outputBytes));

    return {
      kind,

      routes,

      sourceBytes,

      buildMs: median(group.map((result) => result.buildMs)),

      processMs: median(group.map((result) => result.processMs)),

      outputBytes,

      bundleRatio: outputBytes / sourceBytes,
    };
  }),
);

console.log("\nGelis P6-A2 build baseline");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Samples: ${SAMPLES}\n`);

console.table(
  rows.map((row) => ({
    kind: row.kind,

    routes: row.routes,

    "source KB": formatKb(row.sourceBytes),

    "build ms": round(row.buildMs, 2),

    "process ms": round(row.processMs, 2),

    "bundle KB": formatKb(row.outputBytes),

    "bundle/source": round(row.bundleRatio, 2),
  })),
);

writeFileSync(
  resolve(RESULTS, "build-baseline-v0.1.json"),

  `${JSON.stringify(
    {
      metadata: {
        generatedAt: new Date().toISOString(),

        phase: "P6-A2",

        bun: Bun.version,

        cpu: cpus()[0]?.model ?? "unknown",

        samples: SAMPLES,

        sizes: SIZES,

        kinds: KINDS,
      },

      results: rows,

      raw,
    },

    null,

    2,
  )}\n`,
);

console.log("\nRaw results: " + "bench/aot/results/build-baseline-v0.1.json");

function generateSource(
  kind: RouteKind,

  routes: number,
): string {
  const lines = [
    `import { Gelis } from "../../../src/index.ts";`,
    ``,
    `const app = new Gelis();`,
    ``,
    `const RESPONSE = new Response(null, { status: 204 });`,
    ``,
    `const handler = () => RESPONSE;`,
    ``,
  ];

  for (let index = 0; index < routes; index++) {
    const path = kind === "static" ? `/r/${index}` : `/r/${index}/:id`;

    lines.push(`app.get(${JSON.stringify(path)}, handler);`);
  }

  lines.push(``, `export { app };`, ``);

  return lines.join("\n");
}

async function runBuild(entry: string): Promise<{
  buildMs: number;

  processMs: number;

  outputBytes: number;

  outputCount: number;
}> {
  const started = performance.now();

  const child = Bun.spawn(
    [process.execPath, WORKER],

    {
      cwd: ROOT,

      env: {
        ...process.env,

        ENTRY: entry,
      },

      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdout = await new Response(child.stdout).text();

  const stderr = await new Response(child.stderr).text();

  const exit = await child.exited;

  const processMs = performance.now() - started;

  if (exit !== 0) {
    throw new Error(`Build worker failed\n${stderr}`);
  }

  const line = stdout.trim().split(/\r?\n/).at(-1);

  if (!line) {
    throw new Error("Build worker returned no result");
  }

  const parsed = JSON.parse(line) as {
    buildMs: number;

    outputBytes: number;

    outputCount: number;
  };

  return {
    ...parsed,

    processMs,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);

  const value = sorted[Math.floor(sorted.length / 2)];

  if (value === undefined) {
    throw new Error("Empty median");
  }

  return value;
}

function formatKb(bytes: number): number {
  return round(
    bytes / 1024,

    1,
  );
}

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

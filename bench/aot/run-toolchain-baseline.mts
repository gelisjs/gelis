import {
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const GENERATED = resolve(HERE, "generated");

const ARTIFACTS = resolve(HERE, "artifacts");

const RESULTS = resolve(HERE, "results");

const ROUTE_COUNTS = [1, 5000] as const;

const ROUTE_KINDS = ["static", "dynamic"] as const;

const MODES = ["source", "bundle", "compile", "compile-bytecode"] as const;

const SAMPLES = 7;

type RouteKind = (typeof ROUTE_KINDS)[number];

type Mode = (typeof MODES)[number];

interface FixtureResult {
  readonly routes: number;

  readonly routeKind: RouteKind;

  readonly registrationMs: number;

  readonly firstFetchUs: number;

  readonly rssBytes: number;

  readonly heapUsedBytes: number;
}

interface RawResult extends FixtureResult {
  readonly mode: Mode;

  readonly sample: number;

  readonly processColdMs: number;

  readonly artifactBytes: number;
}

interface PreparedArtifacts {
  readonly source: string;

  readonly bundle: string;

  readonly compile: string;

  readonly compileBytecode: string;

  readonly artifactBytes: Record<Mode, number>;

  readonly buildMs: {
    readonly bundle: number;

    readonly compile: number;

    readonly compileBytecode: number;
  };
}

mkdirSync(GENERATED, {
  recursive: true,
});

mkdirSync(ARTIFACTS, {
  recursive: true,
});

mkdirSync(RESULTS, {
  recursive: true,
});

const raw: RawResult[] = [];

const buildResults: Array<{
  routeKind: RouteKind;

  routes: number;

  bundleMs: number;

  compileMs: number;

  bytecodeMs: number;

  sourceBytes: number;

  bundleBytes: number;

  compileBytes: number;

  bytecodeBytes: number;
}> = [];

let fixtureIndex = 0;

for (const routeKind of ROUTE_KINDS) {
  for (const routes of ROUTE_COUNTS) {
    const artifacts = await prepareArtifacts(routeKind, routes);

    buildResults.push({
      routeKind,

      routes,

      bundleMs: artifacts.buildMs.bundle,

      compileMs: artifacts.buildMs.compile,

      bytecodeMs: artifacts.buildMs.compileBytecode,

      sourceBytes: artifacts.artifactBytes.source,

      bundleBytes: artifacts.artifactBytes.bundle,

      compileBytes: artifacts.artifactBytes.compile,

      bytecodeBytes: artifacts.artifactBytes["compile-bytecode"],
    });

    try {
      for (let sample = 0; sample < SAMPLES; sample++) {
        const order = rotate(
          MODES,

          sample + fixtureIndex,
        );

        for (const mode of order) {
          const result = await runArtifact(
            artifacts,

            mode,

            sample,
          );

          raw.push(result);

          console.log(
            [
              routeKind,

              `${routes} routes`,

              mode,

              `sample ${sample + 1}/${SAMPLES}`,

              `cold ${round(
                result.processColdMs,

                2,
              )} ms`,

              `register ${round(
                result.registrationMs,

                3,
              )} ms`,

              `rss ${round(
                bytesToMb(result.rssBytes),

                1,
              )} MB`,
            ].join(" | "),
          );
        }
      }
    } finally {
      cleanupArtifacts(artifacts);
    }

    fixtureIndex++;
  }
}

const rows = aggregate(raw);

console.log("\nGelis P6-B Bun toolchain baseline");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Samples:     ${SAMPLES}`);

console.log("Modes:       source / bundle / compile / compile-bytecode\n");

console.table(
  rows.map((row) => ({
    kind: row.routeKind,

    routes: row.routes,

    mode: row.mode,

    "cold ms": round(
      row.processColdMs,

      2,
    ),

    "cold cv %": round(
      row.processColdCv * 100,

      2,
    ),

    "register ms": round(
      row.registrationMs,

      3,
    ),

    "first fetch us": round(
      row.firstFetchUs,

      2,
    ),

    "rss MB": round(
      row.rssMb,

      1,
    ),

    "artifact MB": round(
      row.artifactMb,

      2,
    ),
  })),
);

console.log("\nBuild artifacts\n");

console.table(
  buildResults.map((result) => ({
    kind: result.routeKind,

    routes: result.routes,

    "bundle ms": round(result.bundleMs, 2),

    "compile ms": round(result.compileMs, 2),

    "bytecode ms": round(result.bytecodeMs, 2),

    "source KB": round(
      result.sourceBytes / 1024,

      1,
    ),

    "bundle KB": round(
      result.bundleBytes / 1024,

      1,
    ),

    "compile MB": round(
      bytesToMb(result.compileBytes),

      2,
    ),

    "bytecode MB": round(
      bytesToMb(result.bytecodeBytes),

      2,
    ),
  })),
);

writeFileSync(
  resolve(RESULTS, "toolchain-baseline-v0.1.json"),

  `${JSON.stringify(
    {
      metadata: {
        generatedAt: new Date().toISOString(),

        phase: "P6-B",

        bun: Bun.version,

        cpu: cpus()[0]?.model ?? "unknown",

        samples: SAMPLES,

        routeCounts: ROUTE_COUNTS,

        routeKinds: ROUTE_KINDS,

        modes: MODES,
      },

      results: rows,

      builds: buildResults,

      raw,
    },

    null,

    2,
  )}\n`,
);

console.log(
  "\nRaw results: " + "bench/aot/results/toolchain-baseline-v0.1.json",
);

async function prepareArtifacts(
  routeKind: RouteKind,

  routes: number,
): Promise<PreparedArtifacts> {
  const base = `${routeKind}-${routes}`;

  const source = resolve(
    GENERATED,

    `toolchain-${base}.ts`,
  );

  const bundle = resolve(
    ARTIFACTS,

    `toolchain-${base}.js`,
  );

  const executableSuffix = process.platform === "win32" ? ".exe" : "";

  const compile = resolve(
    ARTIFACTS,

    `toolchain-${base}-compile${executableSuffix}`,
  );

  const compileBytecode = resolve(
    ARTIFACTS,

    `toolchain-${base}-bytecode${executableSuffix}`,
  );

  writeFileSync(
    source,

    generateFixture(
      routeKind,

      routes,
    ),
  );

  const bundleBuild = await buildBundle(
    source,

    bundle,
  );

  const compileBuild = await buildExecutable(
    source,

    compile,

    false,
  );

  const bytecodeBuild = await buildExecutable(
    source,

    compileBytecode,

    true,
  );

  return {
    source,

    bundle,

    compile,

    compileBytecode,

    artifactBytes: {
      source: statSync(source).size,

      bundle: statSync(bundle).size,

      compile: statSync(compile).size,

      "compile-bytecode": statSync(compileBytecode).size,
    },

    buildMs: {
      bundle: bundleBuild,

      compile: compileBuild,

      compileBytecode: bytecodeBuild,
    },
  };
}

async function buildBundle(
  entry: string,

  output: string,
): Promise<number> {
  const started = performance.now();

  const result = await Bun.build({
    entrypoints: [entry],

    target: "bun",

    format: "esm",

    minify: false,

    sourcemap: "none",

    throw: false,
  });

  const elapsed = performance.now() - started;

  if (!result.success) {
    throwBuildError(
      "bundle",

      result.logs,
    );
  }

  const artifact = result.outputs[0];

  if (!artifact) {
    throw new Error("Bundle build produced no output");
  }

  await Bun.write(
    output,

    artifact,
  );

  return elapsed;
}

async function buildExecutable(
  entry: string,
  output: string,
  bytecode: boolean,
): Promise<number> {
  const started = performance.now();

  const result = await Bun.build({
    entrypoints: [entry],

    target: "bun",

    format: "esm",

    compile: {
      outfile: output,
    },

    bytecode,

    minify: false,

    sourcemap: "none",

    throw: false,
  });

  const elapsed = performance.now() - started;

  if (!result.success) {
    throwBuildError(
      bytecode ? "compile-bytecode" : "compile",

      result.logs,
    );
  }

  return elapsed;
}

async function runArtifact(
  artifacts: PreparedArtifacts,

  mode: Mode,

  sample: number,
): Promise<RawResult> {
  const file = artifactPath(
    artifacts,

    mode,
  );

  const command =
    mode === "compile" || mode === "compile-bytecode"
      ? [file]
      : [process.execPath, file];

  const started = performance.now();

  const child = Bun.spawn(
    command,

    {
      cwd: ROOT,

      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdout = await new Response(child.stdout).text();

  const stderr = await new Response(child.stderr).text();

  const exitCode = await child.exited;

  const processColdMs = performance.now() - started;

  if (exitCode !== 0) {
    throw new Error(
      [
        `Toolchain fixture failed`,
        `mode=${mode}`,
        `sample=${sample}`,
        stderr,
      ].join("\n"),
    );
  }

  const line = stdout.trim().split(/\r?\n/).at(-1);

  if (!line) {
    throw new Error(`No fixture result for ${mode}`);
  }

  const parsed: unknown = JSON.parse(line);

  const fixture = toFixtureResult(parsed);

  return {
    ...fixture,

    mode,

    sample,

    processColdMs,

    artifactBytes: artifacts.artifactBytes[mode],
  };
}

function generateFixture(
  routeKind: RouteKind,

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
    `const registrationStarted = performance.now();`,
  ];

  for (let index = 0; index < routes; index++) {
    const path = routeKind === "static" ? `/r/${index}` : `/r/${index}/:id`;

    lines.push(`app.get(${JSON.stringify(path)}, handler);`);
  }

  const target =
    routeKind === "static" ? `/r/${routes - 1}` : `/r/${routes - 1}/target`;

  lines.push(
    ``,
    `const registrationMs = performance.now() - registrationStarted;`,
    ``,
    `const memory = process.memoryUsage();`,
    ``,
    `const request = new Request(${JSON.stringify(
      `http://gelis.test${target}`,
    )});`,
    ``,
    `const firstFetchStarted = performance.now();`,
    ``,
    `const result = app.fetch(request);`,
    ``,
    `if (result && typeof result === "object" && "then" in result) {`,
    `  throw new Error("Plain fixture unexpectedly became asynchronous");`,
    `}`,
    ``,
    `const response = result as Response;`,
    ``,
    `const firstFetchUs = (performance.now() - firstFetchStarted) * 1000;`,
    ``,
    `if (response.status !== 204) {`,
    `  throw new Error(\`Unexpected response: \${response.status}\`);`,
    `}`,
    ``,
    `console.log(JSON.stringify({`,
    `  routes: ${routes},`,
    `  routeKind: ${JSON.stringify(routeKind)},`,
    `  registrationMs,`,
    `  firstFetchUs,`,
    `  rssBytes: memory.rss,`,
    `  heapUsedBytes: memory.heapUsed,`,
    `}));`,
    ``,
  );

  return lines.join("\n");
}

function artifactPath(
  artifacts: PreparedArtifacts,

  mode: Mode,
): string {
  switch (mode) {
    case "source":
      return artifacts.source;

    case "bundle":
      return artifacts.bundle;

    case "compile":
      return artifacts.compile;

    case "compile-bytecode":
      return artifacts.compileBytecode;
  }
}

function cleanupArtifacts(artifacts: PreparedArtifacts): void {
  for (const path of [
    artifacts.bundle,
    artifacts.compile,
    artifacts.compileBytecode,
  ]) {
    rmSync(
      path,

      {
        force: true,
      },
    );
  }
}

function throwBuildError(
  mode: string,

  logs: readonly unknown[],
): never {
  throw new Error([`${mode} build failed`, ...logs.map(String)].join("\n"));
}

function toFixtureResult(value: unknown): FixtureResult {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid fixture result");
  }

  const result = value as Record<string, unknown>;

  const routeKind = result.routeKind;

  if (routeKind !== "static" && routeKind !== "dynamic") {
    throw new Error("Invalid route kind");
  }

  return {
    routes: numberField(
      result,

      "routes",
    ),

    routeKind,

    registrationMs: numberField(
      result,

      "registrationMs",
    ),

    firstFetchUs: numberField(
      result,

      "firstFetchUs",
    ),

    rssBytes: numberField(
      result,

      "rssBytes",
    ),

    heapUsedBytes: numberField(
      result,

      "heapUsedBytes",
    ),
  };
}

function numberField(
  value: Record<string, unknown>,

  key: string,
): number {
  const result = value[key];

  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error(`Invalid numeric field: ${key}`);
  }

  return result;
}

function aggregate(results: readonly RawResult[]) {
  return ROUTE_KINDS.flatMap((routeKind) =>
    ROUTE_COUNTS.flatMap((routes) =>
      MODES.map((mode) => {
        const group = results.filter(
          (result) =>
            result.routeKind === routeKind &&
            result.routes === routes &&
            result.mode === mode,
        );

        if (group.length === 0) {
          throw new Error(`Missing group: ${routeKind}/${routes}/${mode}`);
        }

        const cold = group.map((result) => result.processColdMs);

        return {
          routeKind,

          routes,

          mode,

          processColdMs: median(cold),

          processColdCv: coefficientOfVariation(cold),

          registrationMs: median(group.map((result) => result.registrationMs)),

          firstFetchUs: median(group.map((result) => result.firstFetchUs)),

          rssMb: median(group.map((result) => bytesToMb(result.rssBytes))),

          artifactMb: median(
            group.map((result) => bytesToMb(result.artifactBytes)),
          ),
        };
      }),
    ),
  );
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

function rotate<T>(
  values: readonly T[],

  offset: number,
): T[] {
  const start = offset % values.length;

  return [...values.slice(start), ...values.slice(0, start)];
}

function bytesToMb(bytes: number): number {
  return bytes / 1024 / 1024;
}

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

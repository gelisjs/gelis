import { mkdirSync, rmSync } from "node:fs";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { aot } from "elysia-v2/plugin/aot/bun";

const HERE = dirname(fileURLToPath(import.meta.url));

const GENERATED_DIR = resolve(HERE, "generated");

const ROUTES = 5000;

const cases = [
  {
    name: "static-raw",

    routeKind: "static",

    bodyKind: "raw",
  },

  {
    name: "dynamic-raw",

    routeKind: "dynamic",

    bodyKind: "raw",
  },

  {
    name: "static-json",

    routeKind: "static",

    bodyKind: "json",
  },

  {
    name: "dynamic-json",

    routeKind: "dynamic",

    bodyKind: "json",
  },
] as const;

const selectedCase = process.env.ELYSIA_AOT_CASE;

if (!selectedCase) {
  rmSync(GENERATED_DIR, {
    recursive: true,

    force: true,
  });

  mkdirSync(GENERATED_DIR, {
    recursive: true,
  });

  for (const benchmarkCase of cases) {
    console.log(`Building Elysia 2 AOT: ${benchmarkCase.name}`);

    const child = Bun.spawn(
      [process.execPath, import.meta.path],

      {
        cwd: process.cwd(),

        env: {
          ...process.env,

          ELYSIA_AOT_CASE: benchmarkCase.name,

          ROUTES: String(ROUTES),

          ROUTE_KIND: benchmarkCase.routeKind,

          BODY_KIND: benchmarkCase.bodyKind,
        },

        stdout: "inherit",

        stderr: "inherit",
      },
    );

    const exitCode = await child.exited;

    if (exitCode !== 0) {
      throw new Error(`Elysia 2 AOT build failed for ${benchmarkCase.name}`);
    }
  }

  console.log("\nElysia 2 AOT artifacts built.");

  process.exit(0);
}

const benchmarkCase = cases.find(
  (candidate) => candidate.name === selectedCase,
);

if (!benchmarkCase) {
  throw new Error(`Unknown ELYSIA_AOT_CASE: ${selectedCase}`);
}

const outdir = resolve(GENERATED_DIR, benchmarkCase.name);

mkdirSync(outdir, {
  recursive: true,
});

const appEntry = resolve(HERE, "app.ts");

const serverEntry = resolve(HERE, "server.ts");

const result = await Bun.build({
  entrypoints: [serverEntry],

  outdir,

  target: "bun",

  plugins: [aot(appEntry)],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }

  throw new Error(`Bun.build failed for Elysia 2 AOT ${benchmarkCase.name}`);
}

for (const output of result.outputs) {
  console.log(`  ${output.path}`);
}

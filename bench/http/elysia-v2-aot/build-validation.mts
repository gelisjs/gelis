import { mkdirSync, rmSync } from "node:fs";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { aot } from "elysia/plugin/aot/bun";

const HERE = dirname(fileURLToPath(import.meta.url));

const GENERATED_DIR = resolve(HERE, "generated", "validation");

const ROUTES = 5000;

const cases = ["query-sync", "query-async", "body-sync", "query-body"] as const;

type ValidationCase = (typeof cases)[number];

const selectedCase = process.env.ELYSIA_VALIDATION_AOT_CASE;

if (!selectedCase) {
  rmSync(GENERATED_DIR, {
    recursive: true,

    force: true,
  });

  mkdirSync(GENERATED_DIR, {
    recursive: true,
  });

  for (const benchmarkCase of cases) {
    console.log(`Building Elysia 2 validation AOT: ${benchmarkCase}`);

    const child = Bun.spawn(
      [process.execPath, import.meta.path],

      {
        cwd: HERE,

        env: {
          ...process.env,

          ELYSIA_VALIDATION_AOT_CASE: benchmarkCase,

          ROUTES: String(ROUTES),

          CASE: benchmarkCase,
        },

        stdout: "inherit",

        stderr: "inherit",
      },
    );

    const exitCode = await child.exited;

    if (exitCode !== 0) {
      throw new Error(
        `Elysia 2 validation AOT build failed for ${benchmarkCase}`,
      );
    }
  }

  console.log("\nElysia 2 validation AOT artifacts built.");

  process.exit(0);
}

if (!cases.includes(selectedCase as ValidationCase)) {
  throw new Error(`Unknown ELYSIA_VALIDATION_AOT_CASE: ${selectedCase}`);
}

const outdir = resolve(GENERATED_DIR, selectedCase);

mkdirSync(outdir, {
  recursive: true,
});

const appEntry = resolve(HERE, "validation-app.ts");

const serverEntry = resolve(HERE, "validation-server.ts");

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

  throw new Error(
    `Bun.build failed for Elysia 2 validation AOT ${selectedCase}`,
  );
}

for (const output of result.outputs) {
  console.log(`  ${output.path}`);
}

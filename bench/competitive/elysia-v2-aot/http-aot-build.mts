import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { aot } from "elysia/plugin/aot/bun";

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = resolve(HERE, "generated", "cp2-http");
const ROUTES = 5_000;

const cases = [
  { name: "static-raw", routeKind: "static", bodyKind: "raw" },
  { name: "dynamic-raw", routeKind: "dynamic", bodyKind: "raw" },
  { name: "static-json", routeKind: "static", bodyKind: "json" },
  { name: "dynamic-json", routeKind: "dynamic", bodyKind: "json" },
] as const;

const selectedCase = process.env.ELYSIA_CP2_HTTP_CASE;

if (selectedCase === undefined) {
  rmSync(GENERATED_DIR, { recursive: true, force: true });
  mkdirSync(GENERATED_DIR, { recursive: true });

  for (const benchmarkCase of cases) {
    const child = Bun.spawn({
      cmd: [process.execPath, import.meta.path],
      cwd: HERE,
      env: {
        ...process.env,
        ELYSIA_CP2_HTTP_CASE: benchmarkCase.name,
        ROUTES: String(ROUTES),
        ROUTE_KIND: benchmarkCase.routeKind,
        BODY_KIND: benchmarkCase.bodyKind,
      },
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await child.exited;
    if (exitCode !== 0) {
      throw new Error(
        `Elysia 2 CP2-H AOT build failed for ${benchmarkCase.name}`,
      );
    }
  }

  console.log("CP2-H Elysia 2 AOT artifacts built for 5,000 routes");
  process.exit(0);
}

const benchmarkCase = cases.find(
  (candidate) => candidate.name === selectedCase,
);

if (benchmarkCase === undefined) {
  throw new Error(`Unknown ELYSIA_CP2_HTTP_CASE: ${selectedCase}`);
}

const outdir = resolve(GENERATED_DIR, benchmarkCase.name);
mkdirSync(outdir, { recursive: true });

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

  throw new Error(`Bun.build failed for CP2-H AOT ${benchmarkCase.name}`);
}

const artifact = resolve(outdir, "server.js");
if (!(await Bun.file(artifact).exists())) {
  throw new Error(`Missing CP2-H AOT artifact: ${artifact}`);
}

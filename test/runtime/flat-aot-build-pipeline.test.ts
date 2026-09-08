import { randomUUID } from "node:crypto";

import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

import { tmpdir } from "node:os";

import { dirname, resolve } from "node:path";

import { pathToFileURL } from "node:url";

import { describe, expect, test } from "bun:test";

import { writeFlatAotBuildOutput } from "../../src/tooling/flat-aot-build-writer";

import type { FlatAotBuildWriterHost } from "../../src/tooling/flat-aot-build-writer";

const WORKER = resolve(
  process.cwd(),
  "test/runtime/fixtures/flat-aot-build-pipeline-worker.ts",
);

interface WorkerRequest {
  readonly path: string;

  readonly method: string;
}

interface WorkerRequestResult {
  readonly path: string;

  readonly status: number;

  readonly body: string;
}

interface WorkerRun {
  readonly exitCode: number;

  readonly stdout: string;

  readonly stderr: string;
}

describe("Gelis flat AOT end-to-end build pipeline", () => {
  test("builds and executes static, trailing and generic routes in a fresh process", async () => {
    const directory = await createTemporaryDirectory();

    try {
      const imports = productionImports();

      const output = await writeFlatAotBuildOutput(
        `
                import { Gelis } from ${JSON.stringify(imports.gelis)};

                const app = new Gelis();

                app.get(
                  "/static",
                  () => "static",
                );

                app.get(
                  "/users/:id",
                  ({ params }) => params.id,
                );

                app.get(
                  "/teams/:team/users/:id",
                  ({ params }) =>
                    params.team + ":" + params.id,
                );

                export default app;
              `,

        {
          modulePath: resolve(directory, "application.mts"),

          runtimeAdapterImport: imports.runtimeAdapter,

          host: createFileSystemHost(),
        },
      );

      expect(output.routeCount).toBe(3);

      expect(output.artifactPath).toBeDefined();

      const run = await runGeneratedModule(
        output.modulePath,

        ["/static", "/users/42", "/teams/core/users/7"],
      );

      expect(run.exitCode).toBe(0);

      expect(parseWorkerResults(run.stdout)).toEqual([
        {
          path: "/static",

          status: 200,

          body: "static",
        },

        {
          path: "/users/42",

          status: 200,

          body: "42",
        },

        {
          path: "/teams/core/users/7",

          status: 200,

          body: "core:7",
        },
      ]);
    } finally {
      await removeDirectory(directory);
    }
  });

  test("builds ALL and custom methods and executes them in a fresh process", async () => {
    const directory = await createTemporaryDirectory();

    try {
      const imports = productionImports();

      const output = await writeFlatAotBuildOutput(
        `
                import { Gelis } from ${JSON.stringify(imports.gelis)};

                const app = new Gelis();

                app.all(
                  "/resource/:id",
                  ({ params }) => "all:" + params.id,
                );

                app.route(
                  "PURGE",
                  "/resource/:id",
                  ({ params }) => "purge:" + params.id,
                );

                export default app;
              `,

        {
          modulePath: resolve(directory, "application.mts"),

          runtimeAdapterImport: imports.runtimeAdapter,

          host: createFileSystemHost(),
        },
      );

      expect(output.routeCount).toBe(2);

      expect(output.artifactPath).toBeDefined();

      const run = await runGeneratedRequests(
        output.modulePath,

        [
          {
            path: "/resource/42",

            method: "PURGE",
          },

          {
            path: "/resource/42",

            method: "POST",
          },
        ],
      );

      expect(run.exitCode).toBe(0);

      expect(parseWorkerResults(run.stdout)).toEqual([
        {
          path: "/resource/42",

          status: 200,

          body: "purge:42",
        },

        {
          path: "/resource/42",

          status: 200,

          body: "all:42",
        },
      ]);
    } finally {
      await removeDirectory(directory);
    }
  });

  test("preserves pre-route request lifecycle in a fresh process", async () => {
    const directory = await createTemporaryDirectory();

    try {
      const imports = productionImports();

      const output = await writeFlatAotBuildOutput(
        `
                import { Gelis } from ${JSON.stringify(imports.gelis)};

                const app = new Gelis();

                app.onRequest(
                  ({ request }) => {
                    if (
                      new URL(
                        request.url,
                      ).pathname ===
                        "/blocked"
                    ) {
                      return new Response(
                        "blocked",
                        {
                          status: 401,
                        },
                      );
                    }
                  },
                );

                app.get(
                  "/blocked",
                  () => "handler",
                );

                app.get(
                  "/ok",
                  () => "ok",
                );

                export default app;
              `,

        {
          modulePath: resolve(directory, "application.mts"),

          runtimeAdapterImport: imports.runtimeAdapter,

          host: createFileSystemHost(),
        },
      );

      const run = await runGeneratedModule(
        output.modulePath,

        ["/blocked", "/ok"],
      );

      expect(run.exitCode).toBe(0);

      expect(parseWorkerResults(run.stdout)).toEqual([
        {
          path: "/blocked",

          status: 401,

          body: "blocked",
        },

        {
          path: "/ok",

          status: 200,

          body: "ok",
        },
      ]);
    } finally {
      await removeDirectory(directory);
    }
  });

  test("installs the prebuilt runtime before the first post-route application mutation", async () => {
    const directory = await createTemporaryDirectory();

    try {
      const imports = productionImports();

      const output = await writeFlatAotBuildOutput(
        `
                import { Gelis } from ${JSON.stringify(imports.gelis)};

                const app = new Gelis();

                app.get(
                  "/route",
                  () => "handler",
                );

                app.onRequest(
                  () =>
                    new Response(
                      "post-install",
                      {
                        status: 409,
                      },
                    ),
                );

                export default app;
              `,

        {
          modulePath: resolve(directory, "application.mts"),

          runtimeAdapterImport: imports.runtimeAdapter,

          host: createFileSystemHost(),
        },
      );

      const generated = await readFile(output.modulePath, "utf8");

      const installOffset = generated.indexOf(
        "__gelisAotInstall(app, __gelisAotHandlers);",
      );

      const lifecycleOffset = generated.indexOf("app.onRequest(");

      expect(installOffset).toBeGreaterThanOrEqual(0);

      expect(lifecycleOffset).toBeGreaterThan(installOffset);

      const run = await runGeneratedModule(
        output.modulePath,

        ["/route"],
      );

      expect(run.exitCode).toBe(0);

      expect(parseWorkerResults(run.stdout)).toEqual([
        {
          path: "/route",

          status: 409,

          body: "post-install",
        },
      ]);
    } finally {
      await removeDirectory(directory);
    }
  });

  test("keeps zero-route builds on the normal runtime path", async () => {
    const directory = await createTemporaryDirectory();

    try {
      const imports = productionImports();

      const source = `
            import { Gelis } from ${JSON.stringify(imports.gelis)};

            const app = new Gelis();

            export default app;
          `;

      const output = await writeFlatAotBuildOutput(
        source,

        {
          modulePath: resolve(directory, "application.mts"),

          runtimeAdapterImport: imports.runtimeAdapter,

          host: createFileSystemHost(),
        },
      );

      expect(output.routeCount).toBe(0);

      expect(output.artifactPath).toBeUndefined();

      expect(output.shapeFingerprint).toBeUndefined();

      expect(await readFile(output.modulePath, "utf8")).toBe(source);

      const run = await runGeneratedModule(
        output.modulePath,

        ["/missing"],
      );

      expect(run.exitCode).toBe(0);

      const results = parseWorkerResults(run.stdout);

      expect(results).toHaveLength(1);

      expect(results[0]?.status).toBe(404);
    } finally {
      await removeDirectory(directory);
    }
  });

  test("rejects a stale transported artifact in a fresh process", async () => {
    const directory = await createTemporaryDirectory();

    try {
      const imports = productionImports();

      const output = await writeFlatAotBuildOutput(
        `
                import { Gelis } from ${JSON.stringify(imports.gelis)};

                const app = new Gelis();

                app.get(
                  "/route",
                  () => "ok",
                );

                export default app;
              `,

        {
          modulePath: resolve(directory, "application.mts"),

          runtimeAdapterImport: imports.runtimeAdapter,

          host: createFileSystemHost(),
        },
      );

      const artifactPath = requireArtifactPath(output.artifactPath);

      const artifact = JSON.parse(
        await readFile(artifactPath, "utf8"),
      ) as unknown[];

      artifact[2] = "stale-artifact-fingerprint";

      await writeFile(artifactPath, JSON.stringify(artifact), "utf8");

      const run = await runGeneratedModule(
        output.modulePath,

        ["/route"],
      );

      expect(run.exitCode).not.toBe(0);

      expect(run.stderr).toContain(
        "Gelis flat AOT artifact fingerprint mismatch",
      );
    } finally {
      await removeDirectory(directory);
    }
  });
});

function productionImports(): {
  readonly gelis: string;

  readonly runtimeAdapter: string;
} {
  const root = process.cwd();

  return {
    gelis: pathToFileURL(resolve(root, "src/app.ts")).href,

    runtimeAdapter: pathToFileURL(
      resolve(root, "src/runtime/flat-aot-runtime-adapter.ts"),
    ).href,
  };
}

function createFileSystemHost(): FlatAotBuildWriterHost {
  return {
    async writeTextFileAtomically(destination, content) {
      await mkdir(
        dirname(destination),

        {
          recursive: true,
        },
      );

      const temporary =
        `${destination}.` + `${process.pid}.` + `${randomUUID()}.tmp`;

      try {
        await writeFile(temporary, content, "utf8");

        await rename(temporary, destination);
      } finally {
        await rm(
          temporary,

          {
            force: true,
          },
        );
      }
    },
  };
}

async function runGeneratedModule(
  modulePath: string,

  requestPaths: readonly string[],
): Promise<WorkerRun> {
  const child = Bun.spawn(
    [process.execPath, WORKER],

    {
      env: {
        ...process.env,

        MODULE_PATH: modulePath,

        REQUEST_PATHS: JSON.stringify(requestPaths),
      },

      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdout = await new Response(child.stdout).text();

  const stderr = await new Response(child.stderr).text();

  const exitCode = await child.exited;

  return {
    exitCode,

    stdout,

    stderr,
  };
}

async function runGeneratedRequests(
  modulePath: string,

  requests: readonly WorkerRequest[],
): Promise<WorkerRun> {
  const child = Bun.spawn(
    [process.execPath, WORKER],

    {
      env: {
        ...process.env,

        MODULE_PATH: modulePath,

        REQUESTS_JSON: JSON.stringify(requests),
      },

      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdout = await new Response(child.stdout).text();

  const stderr = await new Response(child.stderr).text();

  const exitCode = await child.exited;

  return {
    exitCode,

    stdout,

    stderr,
  };
}

function parseWorkerResults(stdout: string): WorkerRequestResult[] {
  const line = stdout.trim().split(/\r?\n/).at(-1);

  if (!line) {
    throw new Error("E5E worker produced no result");
  }

  return JSON.parse(line) as WorkerRequestResult[];
}

async function createTemporaryDirectory(): Promise<string> {
  return mkdtemp(resolve(tmpdir(), "gelis-e5e-"));
}

async function removeDirectory(directory: string): Promise<void> {
  await rm(
    directory,

    {
      recursive: true,

      force: true,
    },
  );
}

function requireArtifactPath(value: string | undefined): string {
  if (value === undefined) {
    throw new Error("Missing E5E artifact path");
  }

  return value;
}

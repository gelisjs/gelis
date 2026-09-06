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

import type { Gelis } from "../../src/app";

import { writeFlatAotBuildOutput } from "../../src/tooling/flat-aot-build-writer";

import type { FlatAotBuildWriterHost } from "../../src/tooling/flat-aot-build-writer";

describe("Gelis flat AOT build writer", () => {
  test("writes and executes a complete production AOT build", async () => {
    const directory = await createTemporaryDirectory();

    try {
      const root = process.cwd();

      const gelisImport = pathToFileURL(resolve(root, "src/app.ts")).href;

      const runtimeAdapterImport = pathToFileURL(
        resolve(root, "src/runtime/flat-aot-runtime-adapter.ts"),
      ).href;

      const modulePath = resolve(directory, "application.mts");

      const writes: string[] = [];

      const host = createFileSystemHost(writes);

      const output = await writeFlatAotBuildOutput(
        `
                import { Gelis } from ${JSON.stringify(gelisImport)};

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

                globalThis.__gelisE5DApp = app;
              `,

        {
          modulePath,

          runtimeAdapterImport,

          host,

          compileOptions: {
            fileName: "application.mts",
          },
        },
      );

      expect(output.routeCount).toBe(3);

      expect(output.shapeFingerprint?.length).toBe(64);

      const artifactPath = requireArtifactPath(output.artifactPath);

      expect(artifactPath).toContain(output.shapeFingerprint!);

      /*
       * Artifact publication must happen before
       * module publication.
       */
      expect(writes).toEqual([artifactPath, modulePath]);

      const generatedCode = await readFile(output.modulePath, "utf8");

      expect(generatedCode).toContain(
        `./application.${output.shapeFingerprint}.gelis-aot.json`,
      );

      await import(pathToFileURL(output.modulePath).href);

      const state = globalThis as typeof globalThis & {
        __gelisE5DApp?: Gelis;
      };

      const app = state.__gelisE5DApp;

      delete state.__gelisE5DApp;

      if (app === undefined) {
        throw new Error("Generated E5D application was not exposed");
      }

      const staticResponse = await app.fetch(
        new Request("http://gelis.test/static"),
      );

      const trailingResponse = await app.fetch(
        new Request("http://gelis.test/users/42"),
      );

      const genericResponse = await app.fetch(
        new Request("http://gelis.test/teams/core/users/7"),
      );

      expect(await staticResponse.text()).toBe("static");

      expect(await trailingResponse.text()).toBe("42");

      expect(await genericResponse.text()).toBe("core:7");
    } finally {
      await rm(
        directory,

        {
          recursive: true,

          force: true,
        },
      );
    }
  });

  test("produces deterministic fingerprint-addressed output", async () => {
    const directory = await createTemporaryDirectory();

    try {
      const modulePath = resolve(directory, "application.mts");

      const source = `
            const app = new Gelis();

            app.get(
              "/route",
              () => "ok",
            );
          `;

      const host = createFileSystemHost();

      const options = {
        modulePath,

        runtimeAdapterImport: "@gelis/internal/flat-aot-runtime-adapter",

        host,
      } as const;

      const first = await writeFlatAotBuildOutput(source, options);

      const firstModule = await readFile(first.modulePath, "utf8");

      const firstArtifact = await readFile(
        requireArtifactPath(first.artifactPath),
        "utf8",
      );

      const second = await writeFlatAotBuildOutput(source, options);

      expect(second).toEqual(first);

      expect(await readFile(second.modulePath, "utf8")).toBe(firstModule);

      expect(
        await readFile(requireArtifactPath(second.artifactPath), "utf8"),
      ).toBe(firstArtifact);
    } finally {
      await rm(
        directory,

        {
          recursive: true,

          force: true,
        },
      );
    }
  });

  test("keeps the previous immutable artifact when source shape changes", async () => {
    const directory = await createTemporaryDirectory();

    try {
      const modulePath = resolve(directory, "application.mts");

      const options = {
        modulePath,

        runtimeAdapterImport: "@gelis/internal/flat-aot-runtime-adapter",

        host: createFileSystemHost(),
      } as const;

      const first = await writeFlatAotBuildOutput(
        `
                const app = new Gelis();

                app.get(
                  "/first",
                  () => "first",
                );
              `,

        options,
      );

      const firstArtifactPath = requireArtifactPath(first.artifactPath);

      const firstArtifact = await readFile(firstArtifactPath, "utf8");

      const second = await writeFlatAotBuildOutput(
        `
                const app = new Gelis();

                app.get(
                  "/second",
                  () => "second",
                );
              `,

        options,
      );

      const secondArtifactPath = requireArtifactPath(second.artifactPath);

      expect(second.shapeFingerprint).not.toBe(first.shapeFingerprint);

      expect(secondArtifactPath).not.toBe(firstArtifactPath);

      expect(await readFile(firstArtifactPath, "utf8")).toBe(firstArtifact);

      const generatedCode = await readFile(second.modulePath, "utf8");

      expect(generatedCode).toContain(
        `./application.${second.shapeFingerprint}.gelis-aot.json`,
      );

      expect(generatedCode).not.toContain(
        `./application.${first.shapeFingerprint}.gelis-aot.json`,
      );
    } finally {
      await rm(
        directory,

        {
          recursive: true,

          force: true,
        },
      );
    }
  });

  test("writes zero-route source without creating an AOT artifact", async () => {
    const directory = await createTemporaryDirectory();

    try {
      const modulePath = resolve(directory, "application.mts");

      const source = `
            const app = new Gelis();

            const value = 123;
          `;

      const writes: string[] = [];

      const output = await writeFlatAotBuildOutput(
        source,

        {
          modulePath,

          runtimeAdapterImport: "@gelis/internal/flat-aot-runtime-adapter",

          host: createFileSystemHost(writes),
        },
      );

      expect(output.routeCount).toBe(0);

      expect(output.shapeFingerprint).toBeUndefined();

      expect(output.artifactPath).toBeUndefined();

      expect(writes).toEqual([modulePath]);

      expect(await readFile(modulePath, "utf8")).toBe(source);
    } finally {
      await rm(
        directory,

        {
          recursive: true,

          force: true,
        },
      );
    }
  });

  test("does not replace a previous build when source compilation fails", async () => {
    const directory = await createTemporaryDirectory();

    try {
      const modulePath = resolve(directory, "application.mts");

      const previous = "previous-successful-build";

      await writeFile(modulePath, previous, "utf8");

      const writes: string[] = [];

      await expect(
        writeFlatAotBuildOutput(
          `
                const path = "/dynamic";

                const app = new Gelis();

                app.get(
                  path,
                  () => "not-supported",
                );
              `,

          {
            modulePath,

            runtimeAdapterImport: "@gelis/internal/flat-aot-runtime-adapter",

            host: createFileSystemHost(writes),
          },
        ),
      ).rejects.toThrow();

      expect(writes).toEqual([]);

      expect(await readFile(modulePath, "utf8")).toBe(previous);
    } finally {
      await rm(
        directory,

        {
          recursive: true,

          force: true,
        },
      );
    }
  });
});

function createFileSystemHost(writes: string[] = []): FlatAotBuildWriterHost {
  return {
    async writeTextFileAtomically(destination, content) {
      writes.push(destination);

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

async function createTemporaryDirectory(): Promise<string> {
  return mkdtemp(resolve(tmpdir(), "gelis-e5d-"));
}

function requireArtifactPath(value: string | undefined): string {
  if (value === undefined) {
    throw new Error("Missing E5D test artifact path");
  }

  return value;
}

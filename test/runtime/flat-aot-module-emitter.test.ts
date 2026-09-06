import { mkdtemp, rm, writeFile } from "node:fs/promises";

import { tmpdir } from "node:os";

import { resolve } from "node:path";

import { pathToFileURL } from "node:url";

import { describe, expect, test } from "bun:test";

import type { Gelis } from "../../src/app";

import { emitFlatAotModule } from "../../src/tooling/flat-aot-module-emitter";

import { compileFlatAotSource } from "../../src/tooling/flat-aot-source-compiler";

describe("Gelis flat AOT module emitter", () => {
  test("emits deterministic runtime module and artifact output", async () => {
    const compilation = await compileFlatAotSource(`
            const app = new Gelis();

            app.get(
              "/first",
              () => "first",
            );

            app.get(
              "/users/:id",
              ({ params }) => params.id,
            );
          `);

    const options = {
      runtimeAdapterImport: "@gelis/internal/flat-aot-runtime-adapter",

      artifactImport: "./application.gelis-aot.json",
    } as const;

    const first = emitFlatAotModule(compilation, options);

    const second = emitFlatAotModule(compilation, options);

    expect(second).toEqual(first);

    expect(first.routeCount).toBe(2);

    expect(first.shapeFingerprint).toBe(compilation.plan?.shapeFingerprint);

    expect(first.artifactJson).toBe(JSON.stringify(compilation.artifact));

    expect(first.code).toContain(
      "createFlatAotRuntimeAdapter as __gelisCreateFlatAotRuntimeAdapter",
    );

    expect(first.code).toContain(
      'from "./application.gelis-aot.json" with { type: "json" };',
    );

    expect(first.code).toContain(
      JSON.stringify(compilation.plan?.shapeFingerprint),
    );

    expect(first.code).not.toContain("artifact[2]");
  });

  test("executes an emitted module through the production flat runtime", async () => {
    const root = process.cwd();

    const gelisImport = pathToFileURL(resolve(root, "src/app.ts")).href;

    const runtimeAdapterImport = pathToFileURL(
      resolve(root, "src/runtime/flat-aot-runtime-adapter.ts"),
    ).href;

    const compilation = await compileFlatAotSource(
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

              globalThis.__gelisE5CApp = app;
            `,

      {
        fileName: "application.mts",
      },
    );

    const emission = emitFlatAotModule(
      compilation,

      {
        fileName: "application.mts",

        runtimeAdapterImport,

        artifactImport: "./application.gelis-aot.json",
      },
    );

    const directory = await mkdtemp(resolve(tmpdir(), "gelis-e5c-"));

    try {
      const modulePath = resolve(directory, "application.mts");

      const artifactPath = resolve(directory, "application.gelis-aot.json");

      const artifactJson = emission.artifactJson;

      if (artifactJson === undefined) {
        throw new Error("Missing emitted test artifact");
      }

      await writeFile(modulePath, emission.code, "utf8");

      await writeFile(artifactPath, artifactJson, "utf8");

      await import(pathToFileURL(modulePath).href);

      const globalState = globalThis as typeof globalThis & {
        __gelisE5CApp?: Gelis;
      };

      const app = globalState.__gelisE5CApp;

      delete globalState.__gelisE5CApp;

      if (app === undefined) {
        throw new Error("Generated AOT module did not expose its test app");
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

  test("rejects a stale transported artifact with an independently emitted fingerprint", async () => {
    const root = process.cwd();

    const gelisImport = pathToFileURL(resolve(root, "src/app.ts")).href;

    const runtimeAdapterImport = pathToFileURL(
      resolve(root, "src/runtime/flat-aot-runtime-adapter.ts"),
    ).href;

    const expected = await compileFlatAotSource(
      `
              import { Gelis } from ${JSON.stringify(gelisImport)};

              const app = new Gelis();

              app.get(
                "/expected",
                () => "expected",
              );

              globalThis.__gelisE5CStaleApp = app;
            `,

      {
        fileName: "expected.mts",
      },
    );

    const stale = await compileFlatAotSource(
      `
              const app = new Gelis();

              app.get(
                "/stale",
                () => "stale",
              );
            `,
    );

    const emission = emitFlatAotModule(
      expected,

      {
        fileName: "expected.mts",

        runtimeAdapterImport,

        artifactImport: "./expected.gelis-aot.json",
      },
    );

    const staleArtifactJson = JSON.stringify(stale.artifact);

    const directory = await mkdtemp(resolve(tmpdir(), "gelis-e5c-stale-"));

    try {
      const modulePath = resolve(directory, "expected.mts");

      const artifactPath = resolve(directory, "expected.gelis-aot.json");

      await writeFile(modulePath, emission.code, "utf8");

      await writeFile(artifactPath, staleArtifactJson, "utf8");

      await expect(import(pathToFileURL(modulePath).href)).rejects.toThrow(
        "Gelis flat AOT artifact fingerprint mismatch",
      );
    } finally {
      const globalState = globalThis as typeof globalThis & {
        __gelisE5CStaleApp?: Gelis;
      };

      delete globalState.__gelisE5CStaleApp;

      await rm(
        directory,

        {
          recursive: true,

          force: true,
        },
      );
    }
  });

  test("preserves existing directive and import prelude ordering", async () => {
    const compilation = await compileFlatAotSource(
      `
              "use strict";

              import { Gelis } from "gelis";

              const app = new Gelis();

              app.get(
                "/route",
                () => "ok",
              );
            `,

      {
        fileName: "application.mts",
      },
    );

    const emission = emitFlatAotModule(
      compilation,

      {
        fileName: "application.mts",

        runtimeAdapterImport: "@gelis/internal/flat-aot-runtime-adapter",

        artifactImport: "./application.gelis-aot.json",
      },
    );

    const directive = emission.code.indexOf('"use strict";');

    const userImport = emission.code.indexOf('import { Gelis } from "gelis";');

    const runtimeImport = emission.code.indexOf(
      "createFlatAotRuntimeAdapter as __gelisCreateFlatAotRuntimeAdapter",
    );

    const appDeclaration = emission.code.indexOf("const app = new Gelis();");

    expect(directive).toBeGreaterThanOrEqual(0);

    expect(userImport).toBeGreaterThan(directive);

    expect(runtimeImport).toBeGreaterThan(userImport);

    expect(appDeclaration).toBeGreaterThan(runtimeImport);
  });

  test("leaves zero-route source unchanged without runtime transport", async () => {
    const source = `
          const app = new Gelis();

          const value = 123;
        `;

    const compilation = await compileFlatAotSource(source);

    const emission = emitFlatAotModule(
      compilation,

      {
        runtimeAdapterImport: "@gelis/internal/flat-aot-runtime-adapter",

        artifactImport: "./application.gelis-aot.json",
      },
    );

    expect(emission.routeCount).toBe(0);

    expect(emission.shapeFingerprint).toBeUndefined();

    expect(emission.artifactJson).toBeUndefined();

    expect(emission.code).toBe(source);

    expect(emission.code).not.toContain("createFlatAotRuntimeAdapter");
  });
});

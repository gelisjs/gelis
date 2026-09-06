import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";

import { FLAT_AOT_ARTIFACT_VERSION } from "../../src/runtime/flat-aot-artifact";

import { installFlatAotRuntime } from "../../src/runtime/flat-aot-runtime";

import type { RuntimeRouteHandler } from "../../src/runtime/types";

import { compileFlatAotSource } from "../../src/tooling/flat-aot-source-compiler";

import type { FlatAotSourceCompilation } from "../../src/tooling/flat-aot-source-compiler";

describe("Gelis flat AOT source compiler", () => {
  test("compiles eligible source directly into a flat artifact", async () => {
    const result = await compileFlatAotSource(`
            const app = new Gelis();

            app.get(
              "/first",
              () => "first",
            );

            app.post(
              "/users/:id",
              () => "second",
            );

            app.patch(
              "/teams/:team/users/:id",
              () => "third",
            );
          `);

    expect(result.routeCount).toBe(3);

    expect(result.artifact?.[0]).toBe(FLAT_AOT_ARTIFACT_VERSION);

    expect(result.artifact?.[1]).toBe(3);

    expect(result.artifact?.[2]).toBe(result.plan?.shapeFingerprint);

    expect(result.artifact?.[5]).toEqual([
      "/first",
      "/users/:id",
      "/teams/:team/users/:id",
    ]);

    expect(result.code).toContain(
      "__gelisAotInstall(app, __gelisAotHandlers);",
    );

    expect(result.code).not.toContain("app.get(");

    expect(result.code).not.toContain("app.post(");

    expect(result.code).not.toContain("app.patch(");
  });

  test("preserves custom generated identifiers", async () => {
    const result = await compileFlatAotSource(
      `
              const app = new Gelis();

              app.get(
                "/route",
                () => "ok",
              );
            `,

      {
        handlerArrayIdentifier: "__handlers",

        installerIdentifier: "__install",
      },
    );

    expect(result.code).toContain("const __handlers = new Array(1);");

    expect(result.code).toContain('__handlers[0] = () => "ok";');

    expect(result.code).toContain("__install(app, __handlers);");

    expect(result.artifact?.[1]).toBe(1);
  });

  test("leaves zero-route source unchanged without producing an artifact", async () => {
    const source = `
          const app = new Gelis();

          const value = 123;
        `;

    const result = await compileFlatAotSource(source);

    expect(result.routeCount).toBe(0);

    expect(result.plan).toBeUndefined();

    expect(result.artifact).toBeUndefined();

    expect(result.code).toBe(source);
  });

  test("binds rewritten handlers to the production flat runtime", async () => {
    const result = await compileFlatAotSource(`
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
          `);

    const app = executeCompilation(result);

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
  });

  test("preserves lexical handler acquisition before flat installation", async () => {
    const events: string[] = [];

    const result = await compileFlatAotSource(`
            const app = new Gelis();

            const make = (name) => {
              events.push(
                "make:" + name,
              );

              return () => name;
            };

            app.get(
              "/first",
              make("first"),
            );

            events.push(
              "between",
            );

            app.get(
              "/second",
              make("second"),
            );
          `);

    const app = executeCompilation(
      result,

      events,

      (handlerCount) => {
        events.push("install:" + handlerCount);
      },
    );

    expect(events).toEqual([
      "make:first",
      "between",
      "make:second",
      "install:2",
    ]);

    const first = await app.fetch(new Request("http://gelis.test/first"));

    const second = await app.fetch(new Request("http://gelis.test/second"));

    expect(await first.text()).toBe("first");

    expect(await second.text()).toBe("second");
  });
});

function executeCompilation(
  compilation: FlatAotSourceCompilation,

  events: string[] = [],

  onInstall?: (handlerCount: number) => void,
): Gelis {
  const artifact = compilation.artifact;

  if (artifact === undefined) {
    throw new Error("Missing flat AOT test artifact");
  }

  const execute = new Function(
    "Gelis",

    "events",

    "__gelisAotInstall",

    `${compilation.code}\nreturn app;`,
  );

  return execute(
    Gelis,

    events,

    (
      app: Gelis,

      handlers: readonly RuntimeRouteHandler[],
    ) => {
      onInstall?.(handlers.length);

      installFlatAotRuntime(
        app,

        artifact,

        {
          version: FLAT_AOT_ARTIFACT_VERSION,

          shapeFingerprint: artifact[2],

          handlers,
        },
      );
    },
  ) as Gelis;
}

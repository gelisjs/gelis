import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";

import { createFlatAotRuntimeAdapter } from "../../src/runtime/flat-aot-runtime-adapter";

import type { FlatAotRuntimeInstaller } from "../../src/runtime/flat-aot-runtime-adapter";

import { compileFlatAotSource } from "../../src/tooling/flat-aot-source-compiler";

import type { FlatAotSourceCompilation } from "../../src/tooling/flat-aot-source-compiler";

describe("Gelis flat AOT runtime adapter", () => {
  test("installs rewritten source through the production flat runtime", async () => {
    const compilation = await compileFlatAotSource(`
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

    const app = executeCompilation(compilation);

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

  test("rejects an artifact compiled from a different source shape", async () => {
    const sourceCompilation = await compileFlatAotSource(`
            const app = new Gelis();

            app.get(
              "/expected",
              () => "expected",
            );
          `);

    const staleCompilation = await compileFlatAotSource(`
            const app = new Gelis();

            app.get(
              "/stale",
              () => "stale",
            );
          `);

    const sourcePlan = requirePlan(sourceCompilation);

    const staleArtifact = requireArtifact(staleCompilation);

    const installer = createFlatAotRuntimeAdapter(
      staleArtifact,

      sourcePlan.shapeFingerprint,
    );

    expect(() =>
      executeCode(
        sourceCompilation.code,

        installer,
      ),
    ).toThrow("Gelis flat AOT artifact fingerprint mismatch");
  });

  test("rejects an independently stale expected fingerprint", async () => {
    const compilation = await compileFlatAotSource(`
            const app = new Gelis();

            app.get(
              "/route",
              () => "ok",
            );
          `);

    const artifact = requireArtifact(compilation);

    const installer = createFlatAotRuntimeAdapter(
      artifact,

      "stale-source-fingerprint",
    );

    expect(() =>
      executeCode(
        compilation.code,

        installer,
      ),
    ).toThrow("Gelis flat AOT artifact fingerprint mismatch");
  });

  test("does not validate before the generated install boundary", async () => {
    const events: string[] = [];

    const sourceCompilation = await compileFlatAotSource(`
            const app = new Gelis();

            const make = (name) => {
              events.push(
                "make:" + name,
              );

              return () => name;
            };

            events.push(
              "before-route",
            );

            app.get(
              "/route",
              make("route"),
            );

            events.push(
              "after-route",
            );
          `);

    const staleCompilation = await compileFlatAotSource(`
            const app = new Gelis();

            app.get(
              "/different",
              () => "different",
            );
          `);

    const sourcePlan = requirePlan(sourceCompilation);

    const staleArtifact = requireArtifact(staleCompilation);

    const installer = createFlatAotRuntimeAdapter(
      staleArtifact,

      sourcePlan.shapeFingerprint,
    );

    expect(() =>
      executeCode(
        sourceCompilation.code,

        installer,

        events,
      ),
    ).toThrow("Gelis flat AOT artifact fingerprint mismatch");

    expect(events).toEqual(["before-route", "make:route", "after-route"]);
  });

  test("preserves pre-install application wrappers", async () => {
    const events: string[] = [];

    const compilation = await compileFlatAotSource(`
            const app = new Gelis();

            app.onRequest(
              () => {
                events.push(
                  "request",
                );
              },
            );

            app.get(
              "/route",
              () => {
                events.push(
                  "handler",
                );

                return "ok";
              },
            );
          `);

    const app = executeCompilation(
      compilation,

      events,
    );

    const response = await app.fetch(new Request("http://gelis.test/route"));

    expect(await response.text()).toBe("ok");

    expect(events).toEqual(["request", "handler"]);
  });
});

function executeCompilation(
  compilation: FlatAotSourceCompilation,

  events: string[] = [],
): Gelis {
  const artifact = requireArtifact(compilation);

  const plan = requirePlan(compilation);

  const installer = createFlatAotRuntimeAdapter(
    artifact,

    plan.shapeFingerprint,
  );

  return executeCode(
    compilation.code,

    installer,

    events,
  );
}

function executeCode(
  code: string,

  installer: FlatAotRuntimeInstaller,

  events: string[] = [],
): Gelis {
  const execute = new Function(
    "Gelis",

    "events",

    "__gelisAotInstall",

    `${code}\nreturn app;`,
  );

  return execute(
    Gelis,

    events,

    installer,
  ) as Gelis;
}

function requireArtifact(
  compilation: FlatAotSourceCompilation,
): NonNullable<FlatAotSourceCompilation["artifact"]> {
  const artifact = compilation.artifact;

  if (artifact === undefined) {
    throw new Error("Missing flat AOT test artifact");
  }

  return artifact;
}

function requirePlan(
  compilation: FlatAotSourceCompilation,
): NonNullable<FlatAotSourceCompilation["plan"]> {
  const plan = compilation.plan;

  if (plan === undefined) {
    throw new Error("Missing flat AOT test semantic plan");
  }

  return plan;
}

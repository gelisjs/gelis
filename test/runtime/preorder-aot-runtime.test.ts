import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";

import { PREORDER_AOT_ARTIFACT_VERSION } from "../../src/runtime/preorder-aot-artifact";

import type { PreorderAotArtifact } from "../../src/runtime/preorder-aot-artifact";

import { installPreorderAotRuntime } from "../../src/runtime/preorder-aot-runtime";

import { compilePreorderAotArtifact } from "../../src/tooling/preorder-aot-artifact-compiler";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler";

describe("Gelis preorder AOT runtime", () => {
  test("serves mixed static routes", async () => {
    const artifact = await compileArtifact([
      {
        method: "GET",

        path: "/first",
      },

      {
        method: "POST",

        path: "/second",
      },
    ]);

    const app = new Gelis();

    install(app, artifact, [() => "first", () => "second"]);

    const first = await app.fetch(new Request("http://gelis.test/first"));

    const second = await app.fetch(
      new Request(
        "http://gelis.test/second",

        {
          method: "POST",
        },
      ),
    );

    expect(await first.text()).toBe("first");

    expect(await second.text()).toBe("second");
  });

  test("serves trailing-param routes", async () => {
    const artifact = await compileArtifact([
      {
        method: "GET",

        path: "/users/:id",
      },
    ]);

    const app = new Gelis();

    install(app, artifact, [({ params }) => params.id]);

    const response = await app.fetch(new Request("http://gelis.test/users/42"));

    expect(await response.text()).toBe("42");
  });

  test("serves generic dynamic routes with multiple params", async () => {
    const artifact = await compileArtifact([
      {
        method: "GET",

        path: "/teams/:team/users/:id",
      },
    ]);

    const app = new Gelis();

    install(app, artifact, [({ params }) => `${params.team}:${params.id}`]);

    const response = await app.fetch(
      new Request("http://gelis.test/teams/core/users/7"),
    );

    expect(await response.text()).toBe("core:7");
  });

  test("preserves static precedence over dynamic routes", async () => {
    const artifact = await compileArtifact([
      {
        method: "GET",

        path: "/users/:id",
      },

      {
        method: "GET",

        path: "/users/me",
      },

      {
        method: "GET",

        path: "/users/:id/detail",
      },
    ]);

    const app = new Gelis();

    install(app, artifact, [
      ({ params }) => `dynamic:${params.id}`,

      () => "static",

      ({ params }) => `detail:${params.id}`,
    ]);

    const staticResponse = await app.fetch(
      new Request("http://gelis.test/users/me"),
    );

    const dynamicResponse = await app.fetch(
      new Request("http://gelis.test/users/42"),
    );

    expect(await staticResponse.text()).toBe("static");

    expect(await dynamicResponse.text()).toBe("dynamic:42");
  });

  test("rejects stale runtime bindings", async () => {
    const artifact = await compileArtifact([
      {
        method: "GET",

        path: "/route",
      },
    ]);

    const app = new Gelis();

    expect(() =>
      installPreorderAotRuntime(
        app,
        artifact,

        {
          version: PREORDER_AOT_ARTIFACT_VERSION,

          shapeFingerprint: "stale",

          handlers: [() => "route"],
        },
      ),
    ).toThrow("Gelis preorder AOT artifact fingerprint mismatch");
  });

  test("rejects handler count mismatch", async () => {
    const artifact = await compileArtifact([
      {
        method: "GET",

        path: "/first",
      },

      {
        method: "GET",

        path: "/second",
      },
    ]);

    const app = new Gelis();

    expect(() =>
      installPreorderAotRuntime(
        app,
        artifact,

        {
          version: PREORDER_AOT_ARTIFACT_VERSION,

          shapeFingerprint: artifact[2],

          handlers: [() => "first"],
        },
      ),
    ).toThrow("Gelis preorder AOT artifact route count mismatch");
  });

  test("installs a JSON-round-tripped artifact", async () => {
    const original = await compileArtifact([
      {
        method: "GET",

        path: "/static",
      },

      {
        method: "GET",

        path: "/users/:id",
      },

      {
        method: "PATCH",

        path: "/teams/:team/users/:id",
      },
    ]);

    const artifact = JSON.parse(
      JSON.stringify(original),
    ) as PreorderAotArtifact;

    const app = new Gelis();

    install(app, artifact, [
      () => "static",

      ({ params }) => params.id,

      ({ params }) => `${params.team}:${params.id}`,
    ]);

    const staticResponse = await app.fetch(
      new Request("http://gelis.test/static"),
    );

    const trailingResponse = await app.fetch(
      new Request("http://gelis.test/users/9"),
    );

    const genericResponse = await app.fetch(
      new Request(
        "http://gelis.test/teams/a/users/b",

        {
          method: "PATCH",
        },
      ),
    );

    expect(await staticResponse.text()).toBe("static");

    expect(await trailingResponse.text()).toBe("9");

    expect(await genericResponse.text()).toBe("a:b");
  });

  test("preserves application wrappers installed before preorder runtime", async () => {
    const events: string[] = [];

    const artifact = await compileArtifact([
      {
        method: "GET",

        path: "/route",
      },
    ]);

    const app = new Gelis();

    app.onRequest(() => {
      events.push("request");
    });

    install(app, artifact, [
      () => {
        events.push("handler");

        return "ok";
      },
    ]);

    await app.fetch(new Request("http://gelis.test/route"));

    expect(events).toEqual(["request", "handler"]);
  });

  test("allows normal route registration after preorder installation", async () => {
    const artifact = await compileArtifact([
      {
        method: "GET",

        path: "/prebuilt",
      },
    ]);

    const app = new Gelis();

    install(app, artifact, [() => "prebuilt"]);

    app.get(
      "/normal",

      () => "normal",
    );

    const prebuilt = await app.fetch(new Request("http://gelis.test/prebuilt"));

    const normal = await app.fetch(new Request("http://gelis.test/normal"));

    expect(await prebuilt.text()).toBe("prebuilt");

    expect(await normal.text()).toBe("normal");
  });

  test("rejects mismatched preorder node columns", async () => {
    const original = await compileArtifact([
      {
        method: "GET",

        path: "/users/:id/detail",
      },
    ]);

    const artifact = JSON.parse(
      JSON.stringify(original),
    ) as PreorderAotArtifact;

    const nodeRouteIndex = artifact[6][3] as unknown as number[];

    nodeRouteIndex.pop();

    const app = new Gelis();

    expect(() => install(app, artifact, [({ params }) => params.id])).toThrow(
      "Gelis preorder AOT node column length mismatch",
    );
  });

  test("rejects invalid preorder method stream ranges", async () => {
    const original = await compileArtifact([
      {
        method: "GET",

        path: "/users/:id/detail",
      },
    ]);

    const artifact = JSON.parse(
      JSON.stringify(original),
    ) as PreorderAotArtifact;

    const methods = artifact[6][0] as unknown as unknown[][];

    const method = methods[0];

    if (method === undefined) {
      throw new Error("Missing test method");
    }

    method[7] = 999_999;

    const app = new Gelis();

    expect(() => install(app, artifact, [({ params }) => params.id])).toThrow(
      "Invalid Gelis preorder AOT node range",
    );
  });
});

type RouteShape = {
  readonly method:
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE"
    | "OPTIONS"
    | "HEAD";

  readonly path: string;
};

async function compileArtifact(
  routes: readonly RouteShape[],
): Promise<PreorderAotArtifact> {
  const plan = await compileSemanticRoutePlan(routes);

  return compilePreorderAotArtifact(plan);
}

function install(
  app: Gelis,

  artifact: PreorderAotArtifact,

  handlers: Parameters<typeof installPreorderAotRuntime>[2]["handlers"],
): void {
  installPreorderAotRuntime(
    app,
    artifact,

    {
      version: PREORDER_AOT_ARTIFACT_VERSION,

      shapeFingerprint: artifact[2],

      handlers,
    },
  );
}

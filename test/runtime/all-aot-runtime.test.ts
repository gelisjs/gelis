import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";

import { FLAT_AOT_ARTIFACT_VERSION } from "../../src/runtime/flat-aot-artifact";

import { PREORDER_AOT_ARTIFACT_VERSION } from "../../src/runtime/preorder-aot-artifact";

import { installFlatAotRuntime } from "../../src/runtime/flat-aot-runtime";

import { installPreorderAotRuntime } from "../../src/runtime/preorder-aot-runtime";

import { compileFlatAotArtifact } from "../../src/tooling/flat-aot-artifact-compiler";

import { compilePreorderAotArtifact } from "../../src/tooling/preorder-aot-artifact-compiler";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler";

import { compileAotSource } from "../../src/tooling/aot-source-compiler";

const routeShapes = [
  {
    method: "*",
    path: "/resource/:id",
  },
  {
    method: "PURGE",
    path: "/resource/:id",
  },
] as const;

const handlers = [
  ({ params }: { params: Record<string, string> }) => `all:${params.id}`,
  ({ params }: { params: Record<string, string> }) => `purge:${params.id}`,
] as const;

const headRouteShapes = [
  {
    method: "GET",
    path: "/head/:id",
  },
] as const;

const headHandlers = [
  ({
    request,
    params,
  }: {
    request: Request;

    params: Record<string, string>;
  }) =>
    new Response(
      `get:${request.method}:${params.id}`,

      {
        headers: {
          "content-length": "11",

          "x-route": "GET",
        },
      },
    ),
] as const;

const optionsRouteShapes = [
  {
    method: "GET",
    path: "/options/:id",
  },
  {
    method: "POST",
    path: "/options/:id",
  },
  {
    method: "PURGE",
    path: "/options/:id",
  },
] as const;

const optionsHandlers = [() => "get", () => "post", () => "purge"] as const;

describe("ALL and custom methods across production AOT runtimes", () => {
  test("flat AOT preserves exact custom-method precedence over ALL", async () => {
    const plan = await compileSemanticRoutePlan(routeShapes);

    const artifact = compileFlatAotArtifact(plan);

    const app = new Gelis();

    installFlatAotRuntime(app, artifact, {
      version: FLAT_AOT_ARTIFACT_VERSION,
      shapeFingerprint: artifact[2],
      handlers,
    });

    const exact = await app.fetch(
      new Request("http://gelis.test/resource/42", {
        method: "PURGE",
      }),
    );

    const fallback = await app.fetch(
      new Request("http://gelis.test/resource/42", {
        method: "POST",
      }),
    );

    expect(await exact.text()).toBe("purge:42");
    expect(await fallback.text()).toBe("all:42");
  });

  test("preorder AOT preserves exact custom-method precedence over ALL", async () => {
    const plan = await compileSemanticRoutePlan(routeShapes);

    const artifact = compilePreorderAotArtifact(plan);

    const app = new Gelis();

    installPreorderAotRuntime(app, artifact, {
      version: PREORDER_AOT_ARTIFACT_VERSION,
      shapeFingerprint: artifact[2],
      handlers,
    });

    const exact = await app.fetch(
      new Request("http://gelis.test/resource/42", {
        method: "PURGE",
      }),
    );

    const fallback = await app.fetch(
      new Request("http://gelis.test/resource/42", {
        method: "POST",
      }),
    );

    expect(await exact.text()).toBe("purge:42");
    expect(await fallback.text()).toBe("all:42");
  });

  test("feeds ALL and custom source grammar into preorder AOT without method loss", async () => {
    const compilation = await compileAotSource(`
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
    `);

    const plan = compilation.plan;

    expect(plan).toBeDefined();

    if (plan === undefined) {
      throw new Error("Missing P9-C5 preorder semantic plan");
    }

    expect(plan.routes.map((route) => [route.method, route.path])).toEqual([
      ["*", "/resource/:id"],

      ["PURGE", "/resource/:id"],
    ]);

    const artifact = compilePreorderAotArtifact(plan);

    const app = new Gelis();

    installPreorderAotRuntime(app, artifact, {
      version: PREORDER_AOT_ARTIFACT_VERSION,

      shapeFingerprint: artifact[2],

      handlers,
    });

    const exact = await app.fetch(
      new Request(
        "http://gelis.test/resource/42",

        {
          method: "PURGE",
        },
      ),
    );

    const fallback = await app.fetch(
      new Request(
        "http://gelis.test/resource/42",

        {
          method: "POST",
        },
      ),
    );

    expect(await exact.text()).toBe("purge:42");

    expect(await fallback.text()).toBe("all:42");
  });
});

describe("HEAD semantics across production AOT runtimes", () => {
  test("flat AOT inherits implicit HEAD to GET semantics", async () => {
    const plan = await compileSemanticRoutePlan(headRouteShapes);

    const artifact = compileFlatAotArtifact(plan);

    const app = new Gelis();

    installFlatAotRuntime(
      app,

      artifact,

      {
        version: FLAT_AOT_ARTIFACT_VERSION,

        shapeFingerprint: artifact[2],

        handlers: headHandlers,
      },
    );

    const response = await app.fetch(
      new Request(
        "http://gelis.test/head/42",

        {
          method: "HEAD",
        },
      ),
    );

    expect(response.status).toBe(200);

    expect(response.headers.get("x-route")).toBe("GET");

    expect(response.headers.get("content-length")).toBe("11");

    expect(await response.text()).toBe("");
  });

  test("preorder AOT inherits implicit HEAD to GET semantics", async () => {
    const plan = await compileSemanticRoutePlan(headRouteShapes);

    const artifact = compilePreorderAotArtifact(plan);

    const app = new Gelis();

    installPreorderAotRuntime(
      app,

      artifact,

      {
        version: PREORDER_AOT_ARTIFACT_VERSION,

        shapeFingerprint: artifact[2],

        handlers: headHandlers,
      },
    );

    const response = await app.fetch(
      new Request(
        "http://gelis.test/head/42",

        {
          method: "HEAD",
        },
      ),
    );

    expect(response.status).toBe(200);

    expect(response.headers.get("x-route")).toBe("GET");

    expect(response.headers.get("content-length")).toBe("11");

    expect(await response.text()).toBe("");
  });
});

describe("automatic OPTIONS across production AOT runtimes", () => {
  test("flat AOT inherits automatic OPTIONS and Allow semantics", async () => {
    const plan = await compileSemanticRoutePlan(optionsRouteShapes);

    const artifact = compileFlatAotArtifact(plan);

    const app = new Gelis();

    installFlatAotRuntime(
      app,

      artifact,

      {
        version: FLAT_AOT_ARTIFACT_VERSION,

        shapeFingerprint: artifact[2],

        handlers: optionsHandlers,
      },
    );

    const response = await app.fetch(
      new Request(
        "http://gelis.test/options/42",

        {
          method: "OPTIONS",
        },
      ),
    );

    expect(response.status).toBe(204);

    expect(response.headers.get("allow")).toBe(
      "GET, HEAD, POST, PURGE, OPTIONS",
    );

    expect(await response.text()).toBe("");
  });

  test("preorder AOT inherits automatic OPTIONS and Allow semantics", async () => {
    const plan = await compileSemanticRoutePlan(optionsRouteShapes);

    const artifact = compilePreorderAotArtifact(plan);

    const app = new Gelis();

    installPreorderAotRuntime(
      app,

      artifact,

      {
        version: PREORDER_AOT_ARTIFACT_VERSION,

        shapeFingerprint: artifact[2],

        handlers: optionsHandlers,
      },
    );

    const response = await app.fetch(
      new Request(
        "http://gelis.test/options/42",

        {
          method: "OPTIONS",
        },
      ),
    );

    expect(response.status).toBe(204);

    expect(response.headers.get("allow")).toBe(
      "GET, HEAD, POST, PURGE, OPTIONS",
    );

    expect(await response.text()).toBe("");
  });
});

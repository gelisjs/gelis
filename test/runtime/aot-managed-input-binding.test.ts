import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "../../src";

import type { StandardSchemaV1 } from "../../src";

import {
  captureFlatAotManagedInput,
  createFlatAotRuntimeAdapter,
} from "../../src/runtime/flat-aot-runtime-adapter";

import type { RuntimeRouteHandler } from "../../src/runtime/types";

import { compileAotSource } from "../../src/tooling/aot-source-compiler";

import { compileFlatAotArtifact } from "../../src/tooling/flat-aot-artifact-compiler";

import { compileFlatAotSource } from "../../src/tooling/flat-aot-source-compiler";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler";

function createTextSchema(): StandardSchemaV1<unknown, string> {
  return {
    "~standard": {
      version: 1,
      vendor: "gelis-test",
      validate(value) {
        if (typeof value !== "string") {
          return {
            issues: [
              {
                message: "Expected string",
              },
            ],
          };
        }

        return {
          value: value.toUpperCase(),
        };
      },
    },
  };
}

describe("managed request-body flat AOT binding", () => {
  test("rewrites managed routes into a compact declaration-time input sidecar", async () => {
    const result = await compileAotSource(`
      const Body = schema;
      const app = new Gelis();

      app.post(
        "/text",
        {
          body: Body,
          bodyParser: "text",
          bodyContentTypes: ["text/plain"],
          openapi: {
            summary: "Text body",
          },
        },
        ({ body }) => body,
      );
    `);

    expect(result.managedInputBindingsIdentifier).toBe(
      "__gelisAotInputBindings",
    );

    expect(result.captureManagedInputIdentifier).toBe(
      "__gelisAotCaptureManagedInput",
    );

    expect(result.code).toContain(
      "const __gelisAotInputBindings = new Array(1);",
    );

    expect(result.code).toContain(
      "const __gI = __gelisAotInputBindings;",
    );

    expect(result.code).toContain(
      "const __gC = __gelisAotCaptureManagedInput;",
    );

    expect(result.code).toContain("__gI[0] = __gC(");

    expect(result.code).not.toContain(
      "__gelisAotInputBindings[0] = __gelisAotCaptureManagedInput(",
    );

    expect(result.code).toContain(
      "__gelisAotInstall(app, __gelisAotHandlers, __gelisAotInputBindings);",
    );

    expect(result.code).not.toContain("app.post(");
  });

  test("keeps plain-only rewritten source free of managed sidecars", async () => {
    const result = await compileAotSource(`
      const app = new Gelis();
      app.get("/plain", () => "plain");
    `);

    expect(result.managedInputBindingsIdentifier).toBeUndefined();
    expect(result.captureManagedInputIdentifier).toBeUndefined();
    expect(result.code).not.toContain("__gelisAotInputBindings");
    expect(result.code).not.toContain("__gelisAotCaptureManagedInput");
    expect(result.code).not.toContain("__gI");
    expect(result.code).not.toContain("__gC");
    expect(result.code).toContain(
      "__gelisAotInstall(app, __gelisAotHandlers);",
    );
  });

  test("rejects compact managed AOT identifier collisions", async () => {
    await expect(
      compileAotSource(`
        const __gI = 1;
        const Body = schema;
        const app = new Gelis();
        app.post("/body", { body: Body }, ({ body }) => body);
      `),
    ).rejects.toThrow("internal AOT identifier __gI already exists");

    await expect(
      compileAotSource(`
        const __gC = 1;
        const Body = schema;
        const app = new Gelis();
        app.post("/body", { body: Body }, ({ body }) => body);
      `),
    ).rejects.toThrow("internal AOT identifier __gC already exists");
  });

  test("keeps the topology artifact identical for plain and managed bindings", async () => {
    const plain = await compileFlatAotSource(`
      const app = new Gelis();
      app.post("/same", () => "plain");
    `);

    const managed = await compileFlatAotSource(`
      const Body = schema;
      const app = new Gelis();
      app.post("/same", { body: Body }, ({ body }) => body);
    `);

    expect(managed.artifact).toEqual(plain.artifact);
  });

  test("installs mixed plain and managed routes through the specialized binder", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",
        path: "/plain",
      },
      {
        method: "POST",
        path: "/text",
      },
    ]);

    const artifact = compileFlatAotArtifact(plan);

    const app = new Gelis();

    const handlers = new Array<RuntimeRouteHandler>(2);

    handlers[0] = () => "plain";

    const Body = createTextSchema();

    const inputBindings = new Array<
      ReturnType<typeof captureFlatAotManagedInput> | undefined
    >(2);

    inputBindings[1] = captureFlatAotManagedInput(
      {
        body: Body,
        bodyParser: "text",
        bodyContentTypes: ["TEXT/PLAIN; charset=utf-8", "text/plain"],
        openapi: {
          summary: "Managed text",
        },
      },
      ({ body }) => body,
    );

    const install = createFlatAotRuntimeAdapter(
      artifact,
      plan.shapeFingerprint,
    );

    install(app, handlers, inputBindings);

    const plain = await app.fetch(new Request("http://gelis.test/plain"));

    expect(plain.status).toBe(200);
    expect(await plain.text()).toBe("plain");

    const text = await app.fetch(
      new Request("http://gelis.test/text", {
        method: "POST",
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
        body: "gelis",
      }),
    );

    expect(text.status).toBe(200);
    expect(await text.text()).toBe("GELIS");

    const unsupported = await app.fetch(
      new Request("http://gelis.test/text", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "gelis",
      }),
    );

    expect(unsupported.status).toBe(415);

    const snapshot = inspectContract(app);

    expect(snapshot.routes[0]?.bodyParser).toBeUndefined();
    expect(snapshot.routes[1]?.body).toBe(Body);
    expect(snapshot.routes[1]?.bodyParser).toBe("text");
    expect(snapshot.routes[1]?.bodyContentTypes).toEqual(["text/plain"]);
    expect(snapshot.routes[1]?.openapi).toEqual({
      summary: "Managed text",
    });
  });
});

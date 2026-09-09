import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "../../src";

import type { StandardSchemaV1 } from "../../src";

import type { RouteOptions } from "../../src/route";

import {
  captureFlatAotManagedInput,
  createFlatAotRuntimeAdapter,
} from "../../src/runtime/flat-aot-runtime-adapter";

import type {
  FlatAotManagedInputBinding,
  FlatAotManagedInputBindings,
} from "../../src/runtime/flat-aot-managed-input";

import type { RuntimeRouteHandler } from "../../src/runtime/types";

import { analyzeAotSource } from "../../src/tooling/aot-source-analyzer";

import { compileAotSource } from "../../src/tooling/aot-source-compiler";

import { compileFlatAotArtifact } from "../../src/tooling/flat-aot-artifact-compiler";

import { emitFlatAotModule } from "../../src/tooling/flat-aot-module-emitter";

import { compileFlatAotSource } from "../../src/tooling/flat-aot-source-compiler";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler";

function createSchema<Input = unknown, Output = Input>(
  validate: (
    value: unknown,
  ) => StandardSchemaV1.Result<Output> | Promise<StandardSchemaV1.Result<Output>>,
): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1,
      vendor: "gelis-aot-equivalence-test",
      validate,
    },
  };
}

interface AppPair {
  readonly normal: Gelis;
  readonly aot: Gelis;
}

interface RuntimeRouteRegistrar {
  route(
    method: string,
    path: string,
    options: RouteOptions,
    handler: RuntimeRouteHandler,
  ): unknown;
}

async function createAppPair(
  options: RouteOptions,
  handler: RuntimeRouteHandler,
  method = "POST",
  path = "/body",
): Promise<AppPair> {
  const normal = new Gelis();

  (normal as unknown as RuntimeRouteRegistrar).route(
    method,
    path,
    options,
    handler,
  );

  const plan = await compileSemanticRoutePlan([
    {
      method,
      path,
    },
  ]);

  const artifact = compileFlatAotArtifact(plan);

  const aot = new Gelis();

  const handlers = new Array<RuntimeRouteHandler>(1);

  const inputBindings: FlatAotManagedInputBindings = [
    captureFlatAotManagedInput(options, handler),
  ];

  createFlatAotRuntimeAdapter(
    artifact,
    plan.shapeFingerprint,
  )(
    aot,
    handlers,
    inputBindings,
  );

  return {
    normal,
    aot,
  };
}

async function expectEquivalentResponse(
  pair: AppPair,
  requestFactory: () => Request,
  expectedStatus: number,
): Promise<void> {
  const normalResponse = await pair.normal.fetch(requestFactory());
  const aotResponse = await pair.aot.fetch(requestFactory());

  expect(normalResponse.status).toBe(expectedStatus);
  expect(aotResponse.status).toBe(normalResponse.status);

  expect(await aotResponse.text()).toBe(await normalResponse.text());
}

describe("managed request-body AOT equivalence", () => {
  test("matches normal registration for JSON shorthand and custom JSON media", async () => {
    const JsonBody = createSchema<unknown, { name: string }>((value) => {
      const input = value as { name?: unknown };

      if (typeof input.name !== "string") {
        return {
          issues: [
            {
              message: "Expected name",
            },
          ],
        };
      }

      return {
        value: {
          name: input.name.toUpperCase(),
        },
      };
    });

    const handler: RuntimeRouteHandler = ({ body }) => ({
      name: (body as { name: string }).name,
    });

    const shorthand = await createAppPair(
      {
        body: JsonBody,
      },
      handler,
    );

    await expectEquivalentResponse(
      shorthand,
      () =>
        new Request("http://gelis.test/body", {
          method: "POST",
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            name: "gelis",
          }),
        }),
      200,
    );

    const custom = await createAppPair(
      {
        body: JsonBody,
        bodyParser: "json",
        bodyContentTypes: ["application/vnd.gelis+json"],
      },
      handler,
    );

    await expectEquivalentResponse(
      custom,
      () =>
        new Request("http://gelis.test/body", {
          method: "POST",
          headers: {
            "content-type": "application/vnd.gelis+json",
          },
          body: JSON.stringify({
            name: "custom",
          }),
        }),
      200,
    );

    await expectEquivalentResponse(
      custom,
      () =>
        new Request("http://gelis.test/body", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: "wrong",
          }),
        }),
      415,
    );
  });

  test("matches normal registration for text and URL-encoded bodies", async () => {
    const TextBody = createSchema<unknown, string>((value) => {
      if (typeof value !== "string") {
        return {
          issues: [
            {
              message: "Expected text",
            },
          ],
        };
      }

      return {
        value: value.toUpperCase(),
      };
    });

    const textPair = await createAppPair(
      {
        body: TextBody,
        bodyParser: "text",
      },
      ({ body }) => `text:${body as string}`,
    );

    await expectEquivalentResponse(
      textPair,
      () =>
        new Request("http://gelis.test/body", {
          method: "POST",
          headers: {
            "content-type": "text/plain; charset=utf-8",
          },
          body: "gelis",
        }),
      200,
    );

    type FormBody = Record<string, string | string[]>;

    const Form = createSchema<unknown, FormBody>((value) => ({
      value: value as FormBody,
    }));

    const formPair = await createAppPair(
      {
        body: Form,
        bodyParser: "urlencoded",
      },
      ({ body }) => {
        const form = body as FormBody;

        return {
          name: form.name,
          tag: form.tag,
        };
      },
    );

    await expectEquivalentResponse(
      formPair,
      () =>
        new Request("http://gelis.test/body", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body: "name=Gelis&tag=a&tag=b",
        }),
      200,
    );
  });

  test("matches normal registration for multipart including an empty field name", async () => {
    type MultipartValue = string | File | Array<string | File>;
    type MultipartBody = Record<string, MultipartValue>;

    const Multipart = createSchema<unknown, MultipartBody>((value) => ({
      value: value as MultipartBody,
    }));

    const pair = await createAppPair(
      {
        body: Multipart,
        bodyParser: "multipart",
      },
      ({ body }) => {
        const form = body as MultipartBody;

        return {
          empty: form[""],
          tag: form.tag,
        };
      },
    );

    const boundary = "gelis-aot-equivalence-boundary";

    const wire =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name=""\r\n\r\n` +
      `blank\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="tag"\r\n\r\n` +
      `a\r\n` +
      `--${boundary}--\r\n`;

    await expectEquivalentResponse(
      pair,
      () =>
        new Request("http://gelis.test/body", {
          method: "POST",
          headers: {
            "content-type": `multipart/form-data; boundary=${boundary}`,
          },
          body: wire,
        }),
      200,
    );
  });

  test("matches normal registration for arrayBuffer and query + JSON", async () => {
    const Binary = createSchema<unknown, ArrayBuffer>((value) => {
      if (!(value instanceof ArrayBuffer)) {
        return {
          issues: [
            {
              message: "Expected ArrayBuffer",
            },
          ],
        };
      }

      return {
        value,
      };
    });

    const binaryPair = await createAppPair(
      {
        body: Binary,
        bodyParser: "arrayBuffer",
      },
      ({ body }) => ({
        bytes: Array.from(new Uint8Array(body as ArrayBuffer)),
      }),
    );

    await expectEquivalentResponse(
      binaryPair,
      () =>
        new Request("http://gelis.test/body", {
          method: "POST",
          headers: {
            "content-type": "application/octet-stream",
          },
          body: new Uint8Array([1, 2, 3, 255]),
        }),
      200,
    );

    const Query = createSchema<
      Record<string, string | string[]>,
      number
    >((value) => {
      const query = value as Record<string, string | string[]>;

      return {
        value: Number(query.page),
      };
    });

    const Body = createSchema<unknown, { name: string }>((value) => ({
      value: value as { name: string },
    }));

    const queryBodyPair = await createAppPair(
      {
        query: Query,
        body: Body,
      },
      ({ query, body }) => ({
        page: query as number,
        name: (body as { name: string }).name,
      }),
    );

    await expectEquivalentResponse(
      queryBodyPair,
      () =>
        new Request("http://gelis.test/body?page=7", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: "gelis",
          }),
        }),
      200,
    );
  });

  test("matches normal 415, 400 and 422 request-body failures", async () => {
    const Body = createSchema<unknown, { ok: true }>((value) => {
      const input = value as { ok?: unknown };

      if (input.ok !== true) {
        return {
          issues: [
            {
              message: "Expected ok=true",
            },
          ],
        };
      }

      return {
        value: {
          ok: true,
        },
      };
    });

    const pair = await createAppPair(
      {
        body: Body,
      },
      ({ body }) => body,
    );

    await expectEquivalentResponse(
      pair,
      () =>
        new Request("http://gelis.test/body", {
          method: "POST",
          body: JSON.stringify({
            ok: true,
          }),
        }),
      415,
    );

    await expectEquivalentResponse(
      pair,
      () =>
        new Request("http://gelis.test/body", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: "{",
        }),
      400,
    );

    await expectEquivalentResponse(
      pair,
      () =>
        new Request("http://gelis.test/body", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            ok: false,
          }),
        }),
      422,
    );
  });

  test("preserves normal contract projection and OpenAPI metadata", async () => {
    const Body = createSchema<unknown, string>((value) => ({
      value: String(value),
    }));

    const options = {
      body: Body,
      bodyParser: "text" as const,
      bodyContentTypes: [
        "TEXT/PLAIN; charset=utf-8",
        "text/plain",
        "application/vnd.gelis-text",
      ],
      openapi: {
        summary: "Managed AOT body",
        tags: ["AOT"],
      },
    } satisfies RouteOptions;

    const pair = await createAppPair(
      options,
      ({ body }) => body,
    );

    const normal = inspectContract(pair.normal);
    const aot = inspectContract(pair.aot);

    expect(aot).toEqual(normal);
    expect(aot.routes[0]?.body).toBe(Body);
    expect(aot.routes[0]?.bodyParser).toBe("text");
    expect(aot.routes[0]?.bodyContentTypes).toEqual([
      "text/plain",
      "application/vnd.gelis-text",
    ]);
    expect(aot.routes[0]?.openapi).toEqual({
      summary: "Managed AOT body",
      tags: ["AOT"],
    });
  });

  test("rejects unsupported managed AOT source shapes instead of dropping semantics", () => {
    expect(() =>
      analyzeAotSource(`
        const Body = schema;
        const app = new Gelis();
        app.post("/body", { body: Body, responses: {} }, () => "ok");
      `),
    ).toThrow('managed request-body AOT option "responses" is not supported');

    expect(() =>
      analyzeAotSource(`
        const Body = schema;
        const options = { body: Body };
        const app = new Gelis();
        app.post("/body", options, () => "ok");
      `),
    ).toThrow("managed request-body AOT options must be a directly analyzable object literal");

    expect(() =>
      analyzeAotSource(`
        const Body = schema;
        const base = { body: Body };
        const app = new Gelis();
        app.post("/body", { ...base }, () => "ok");
      `),
    ).toThrow("managed request-body AOT options do not support spread properties");

    expect(() =>
      analyzeAotSource(`
        const Body = schema;
        const app = new Gelis();
        app.post(
          "/body",
          { body: Body },
          () => "ok",
          { beforeHandle() {} },
        );
      `),
    ).toThrow("AOT v0.1 supports only plain path + handler routes");
  });

  test("preserves declaration-time options-before-handler evaluation ordering", async () => {
    const result = await compileAotSource(`
      const app = new Gelis();

      app.post(
        "/body",
        {
          body: (events.push("body"), Body),
          bodyParser: (events.push("parser"), "text"),
        },
        (events.push("handler"), handler),
      );
    `);

    const events: string[] = [];

    const Body = createSchema<unknown, string>((value) => ({
      value: String(value),
    }));

    const handler: RuntimeRouteHandler = ({ body }) => body;

    const run = new Function(
      "Gelis",
      "events",
      "Body",
      "handler",
      "__gelisAotCaptureManagedInput",
      "__gelisAotInstall",
      result.code,
    );

    class FakeGelis {}

    run(
      FakeGelis,
      events,
      Body,
      handler,
      (options: RouteOptions, capturedHandler: RuntimeRouteHandler) => {
        events.push("capture");

        return {
          options,
          capturedHandler,
        };
      },
      (
        _app: unknown,
        handlers: readonly RuntimeRouteHandler[],
        inputBindings: readonly unknown[],
      ) => {
        events.push(`install:${handlers.length}:${inputBindings.length}`);
      },
    );

    expect(events).toEqual([
      "body",
      "parser",
      "handler",
      "capture",
      "install:1:1",
    ]);
  });

  test("captures input-plan media metadata before later source mutation", async () => {
    const result = await compileAotSource(`
      const media = ["text/plain"];
      const app = new Gelis();

      app.post(
        "/body",
        {
          body: Body,
          bodyParser: "text",
          bodyContentTypes: media,
        },
        handler,
      );

      media[0] = "application/json";
    `);

    const Body = createSchema<unknown, string>((value) => ({
      value: String(value),
    }));

    const handler: RuntimeRouteHandler = ({ body }) => body;

    let installedBindings: FlatAotManagedInputBindings | undefined;

    const run = new Function(
      "Gelis",
      "Body",
      "handler",
      "__gelisAotCaptureManagedInput",
      "__gelisAotInstall",
      result.code,
    );

    class FakeGelis {}

    run(
      FakeGelis,
      Body,
      handler,
      captureFlatAotManagedInput,
      (
        _app: unknown,
        _handlers: readonly RuntimeRouteHandler[],
        inputBindings: FlatAotManagedInputBindings,
      ) => {
        installedBindings = inputBindings;
      },
    );

    const binding = installedBindings?.[0] as
      | FlatAotManagedInputBinding
      | undefined;

    expect(binding?.input.bodyContentTypes).toEqual(["text/plain"]);
  });

  test("emits managed capture imports only when the source needs them", async () => {
    const plain = await compileFlatAotSource(`
      const app = new Gelis();
      app.get("/plain", () => "plain");
    `);

    const managed = await compileFlatAotSource(`
      const Body = schema;
      const app = new Gelis();
      app.post("/body", { body: Body }, ({ body }) => body);
    `);

    const plainEmission = emitFlatAotModule(plain, {
      runtimeAdapterImport: "./runtime-adapter",
      artifactImport: "./artifact.json",
    });

    const managedEmission = emitFlatAotModule(managed, {
      runtimeAdapterImport: "./runtime-adapter",
      artifactImport: "./artifact.json",
    });

    expect(plainEmission.code).not.toContain("captureFlatAotManagedInput");
    expect(plainEmission.code).not.toContain("__gelisAotInputBindings");

    expect(managedEmission.code).toContain("captureFlatAotManagedInput");
    expect(managedEmission.code).toContain("__gelisAotInputBindings");
  });
});

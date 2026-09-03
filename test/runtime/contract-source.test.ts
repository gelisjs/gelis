import { describe, expect, test } from "bun:test";

import { Gelis, defineModule, inspectContract } from "../../src";

import type {
  OpenAPIRouteMetadata,
  ResponseContractMap,
  StandardSchemaV1,
} from "../../src";

function createSchema<Input = unknown, Output = Input>(): StandardSchemaV1<
  Input,
  Output
> {
  return {
    "~standard": {
      version: 1,

      vendor: "gelis-test",

      validate(value) {
        return {
          value: value as Output,
        };
      },
    },
  };
}

describe("Gelis contract source", () => {
  test("projects semantic route contracts in registration order", () => {
    const Query = createSchema<
      Record<string, string | string[]>,
      {
        page: number;
      }
    >();

    const Body = createSchema<{
      name: string;
    }>();

    const Output = createSchema<
      unknown,
      {
        id: string;
      }
    >();

    const responses = {
      200: Output,
    } satisfies ResponseContractMap;

    const metadata = {
      summary: "Create user",

      tags: ["Users"],
    } satisfies OpenAPIRouteMetadata;

    const app = new Gelis();

    app.get(
      "/plain",

      () => "plain",
    );

    app.post(
      "/users/:id",

      {
        query: Query,

        body: Body,

        responses,

        openapi: metadata,
      },

      () => ({
        id: "user-1",
      }),
    );

    const snapshot = inspectContract(app);

    expect(snapshot.routes).toHaveLength(2);

    const plain = snapshot.routes[0]!;

    expect(plain).toEqual({
      method: "GET",

      path: "/plain",

      query: undefined,

      body: undefined,

      responses: undefined,

      openapi: undefined,
    });

    const documented = snapshot.routes[1]!;

    expect(documented.method).toBe("POST");

    expect(documented.path).toBe("/users/:id");

    expect(documented.query).toBe(Query);

    expect(documented.body).toBe(Body);

    expect(documented.responses).toBe(responses);

    expect(documented.openapi).toEqual(metadata);

    expect(documented.openapi).not.toBe(metadata);

    expect(Object.keys(documented)).toEqual([
      "method",
      "path",
      "query",
      "body",
      "responses",
      "openapi",
    ]);

    expect("handler" in documented).toBe(false);

    expect("flags" in documented).toBe(false);

    expect("input" in documented).toBe(false);

    expect("responsePlan" in documented).toBe(false);
  });

  test("returns fresh snapshots rather than a live route collection", () => {
    const app = new Gelis();

    app.get(
      "/first",

      () => "first",
    );

    const first = inspectContract(app);

    app.get(
      "/second",

      () => "second",
    );

    const second = inspectContract(app);

    expect(first.routes.map((route) => route.path)).toEqual(["/first"]);

    expect(second.routes.map((route) => route.path)).toEqual([
      "/first",
      "/second",
    ]);

    expect(first).not.toBe(second);

    expect(first.routes).not.toBe(second.routes);

    expect(first.routes[0]).not.toBe(second.routes[0]);
  });

  test("includes routes explicitly excluded from OpenAPI", () => {
    const app = new Gelis();

    app.get(
      "/internal",

      {
        openapi: false,
      },

      () => "internal",
    );

    const snapshot = inspectContract(app);

    expect(snapshot.routes).toHaveLength(1);

    expect(snapshot.routes[0]?.path).toBe("/internal");

    expect(snapshot.routes[0]?.openapi).toBe(false);
  });

  test("projects mounted module routes and ignores unmounted modules", () => {
    const mounted = defineModule(
      "/api",

      (route) => {
        const users = route.get(
          "/users",

          {
            openapi: {
              summary: "List users",
            },
          },

          () => "users",
        );

        const internal = route.get(
          "/internal",

          {
            openapi: false,
          },

          () => "internal",
        );

        return {
          users,
          internal,
        };
      },
    );

    const unmounted = defineModule(
      "/unused",

      (route) => {
        const routeRef = route.get(
          "/route",

          () => "unused",
        );

        return {
          route: routeRef,
        };
      },
    );

    void unmounted;

    const app = new Gelis();

    app.mount(mounted);

    const snapshot = inspectContract(app);

    expect(snapshot.routes.map((route) => route.path)).toEqual([
      "/api/users",
      "/api/internal",
    ]);

    expect(snapshot.routes[0]?.openapi).toEqual({
      summary: "List users",
    });

    expect(snapshot.routes[1]?.openapi).toBe(false);
  });

  test("is unaffected by compiled application lifecycle state", () => {
    const app = new Gelis();

    app.get(
      "/stable",

      {
        openapi: {
          summary: "Stable contract",
        },
      },

      () => "ok",
    );

    const before = inspectContract(app);

    app.onBeforeHandle(() => undefined);

    app.onAfterHandle(() => undefined);

    const after = inspectContract(app);

    expect(after).toEqual(before);

    expect(after).not.toBe(before);

    expect(after.routes[0]).not.toBe(before.routes[0]);
  });

  test("captures OpenAPI metadata structurally at registration while preserving schema references", () => {
    const schema = {
      type: "string",
    } as const;

    const tags = ["Users"];

    const pathParameter = {
      description: "Original path",

      schema,
    };

    const queryParameter = {
      name: "include",

      description: "Original query",

      schema,
    };

    const bodyMetadata = {
      description: "Original body",

      schema,
    };

    const responseMetadata = {
      description: "Original response",

      schema,
    };

    const metadata = {
      summary: "Original summary",

      tags,

      request: {
        params: {
          id: pathParameter,
        },

        query: {
          parameters: [queryParameter],
        },

        body: bodyMetadata,
      },

      responses: {
        200: responseMetadata,
      },
    } satisfies OpenAPIRouteMetadata;

    const app = new Gelis();

    app.get(
      "/users/:id",

      {
        openapi: metadata,
      },

      () => "user",
    );

    /*
     * Mutating caller-owned metadata after
     * registration must not rewrite the captured
     * application contract.
     */
    metadata.summary = "Changed summary";

    tags.push("Changed");

    pathParameter.description = "Changed path";

    queryParameter.description = "Changed query";

    bodyMetadata.description = "Changed body";

    responseMetadata.description = "Changed response";

    const openapi = inspectContract(app).routes[0]?.openapi;

    if (openapi === undefined || openapi === false) {
      throw new Error("Expected OpenAPI metadata");
    }

    expect(openapi.summary).toBe("Original summary");

    expect(openapi.tags).toEqual(["Users"]);

    expect(openapi.request?.params?.id?.description).toBe("Original path");

    const query = openapi.request?.query;

    if (query === undefined || query.parameters === undefined) {
      throw new Error("Expected explicit query parameters");
    }

    expect(query.parameters[0]?.description).toBe("Original query");

    expect(query.parameters[0]?.schema).toBe(schema);

    expect(openapi.request?.body?.description).toBe("Original body");

    expect(openapi.request?.body?.schema).toBe(schema);

    expect(openapi.responses?.[200]?.description).toBe("Original response");

    expect(openapi.responses?.[200]?.schema).toBe(schema);
  });

  test("returns OpenAPI metadata containers detached from application state", () => {
    const schema = {
      type: "string",
    } as const;

    const app = new Gelis();

    app.get(
      "/detached",

      {
        openapi: {
          summary: "Original",

          tags: ["Users"],

          request: {
            params: {
              id: {
                description: "Original path",

                schema,
              },
            },

            query: {
              parameters: [
                {
                  name: "include",

                  description: "Original query",

                  schema,
                },
              ],
            },

            body: {
              description: "Original body",

              schema,
            },
          },

          responses: {
            200: {
              description: "Original response",

              schema,
            },
          },
        },
      },

      () => "ok",
    );

    const first = inspectContract(app);

    const firstOpenAPI = first.routes[0]?.openapi;

    if (firstOpenAPI === undefined || firstOpenAPI === false) {
      throw new Error("Expected OpenAPI metadata");
    }

    /*
     * Returned snapshots are typed read-only,
     * but JavaScript callers can deliberately
     * bypass that type boundary.
     *
     * Such mutation must remain local to the
     * returned snapshot.
     */
    const mutable = firstOpenAPI as any;

    mutable.summary = "Mutated";

    mutable.tags.push("Mutated");

    mutable.request.params.id.description = "Mutated path";

    mutable.request.query.parameters[0].description = "Mutated query";

    mutable.request.body.description = "Mutated body";

    mutable.responses[200].description = "Mutated response";

    const second = inspectContract(app);

    const secondOpenAPI = second.routes[0]?.openapi;

    if (secondOpenAPI === undefined || secondOpenAPI === false) {
      throw new Error("Expected OpenAPI metadata");
    }

    expect(secondOpenAPI.summary).toBe("Original");

    expect(secondOpenAPI.tags).toEqual(["Users"]);

    expect(secondOpenAPI.request?.params?.id?.description).toBe(
      "Original path",
    );

    const secondQuery = secondOpenAPI.request?.query;

    if (secondQuery === undefined || secondQuery.parameters === undefined) {
      throw new Error("Expected explicit query parameters");
    }

    expect(secondQuery.parameters[0]?.description).toBe("Original query");

    expect(secondOpenAPI.request?.body?.description).toBe("Original body");

    expect(secondOpenAPI.responses?.[200]?.description).toBe(
      "Original response",
    );

    /*
     * Explicit JSON Schema objects deliberately
     * remain references. Resource identity is
     * preserved across contract snapshots.
     */
    expect(firstOpenAPI.request?.body?.schema).toBe(schema);

    expect(secondOpenAPI.request?.body?.schema).toBe(schema);
  });

  test("preserves transformed request schema identity without executing validation", () => {
    let validations = 0;

    const Transform: StandardSchemaV1<
      {
        page: string;
      },
      {
        page: number;
      }
    > = {
      "~standard": {
        version: 1,

        vendor: "gelis-test-transform",

        validate(value) {
          validations++;

          const input = value as {
            page: string;
          };

          return {
            value: {
              page: Number(input.page),
            },
          };
        },
      },
    };

    const app = new Gelis();

    app.post(
      "/transform",

      {
        query: Transform,

        body: Transform,
      },

      ({ query, body }) => query.page + body.page,
    );

    app.get(
      "/implicit",

      () => ({
        id: "user-1",
      }),
    );

    const snapshot = inspectContract(app);

    expect(validations).toBe(0);

    expect(snapshot.routes[0]?.query).toBe(Transform);

    expect(snapshot.routes[0]?.body).toBe(Transform);

    /*
     * Handler inference is compile-time only.
     * No explicit response contract means there
     * is no runtime response schema to expose.
     */
    expect(snapshot.routes[0]?.responses).toBeUndefined();

    expect(snapshot.routes[1]?.responses).toBeUndefined();
  });

  test("preserves metadata-only and executable response contract identities", () => {
    const Output = createSchema<
      unknown,
      {
        id: string;
      }
    >();

    const metadataOnly = {
      200: Output,
    } satisfies ResponseContractMap;

    const executable = {
      201: {
        schema: Output,

        validate: true,
      },
    } satisfies ResponseContractMap;

    const app = new Gelis();

    app.get(
      "/metadata-only",

      {
        responses: metadataOnly,
      },

      () => ({
        id: "metadata",
      }),
    );

    app.post(
      "/executable",

      {
        responses: executable,
      },

      ({ reply }) =>
        reply.status(
          201,

          {
            id: "executable",
          },
        ),
    );

    const snapshot = inspectContract(app);

    expect(snapshot.routes[0]?.responses).toBe(metadataOnly);

    expect(snapshot.routes[1]?.responses).toBe(executable);

    expect(snapshot.routes[0]?.responses?.[200]).toBe(Output);

    const executable201 = snapshot.routes[1]?.responses?.[201];

    if (executable201 === undefined || !("schema" in executable201)) {
      throw new Error("Expected executable response descriptor");
    }

    expect(executable201.schema).toBe(Output);
  });

  test("keeps shared module contract state isolated across applications", () => {
    const module = defineModule(
      "/shared",

      (route) => {
        const documented = route.get(
          "/users",

          {
            openapi: {
              summary: "Shared users",

              tags: ["Users"],
            },
          },

          () => "users",
        );

        return {
          documented,
        };
      },
    );

    const appA = new Gelis();

    const appB = new Gelis();

    appA.mount(module);

    appB.mount(module);

    const firstA = inspectContract(appA);

    const metadataA = firstA.routes[0]?.openapi;

    if (metadataA === undefined || metadataA === false) {
      throw new Error("Expected application A metadata");
    }

    (metadataA as any).summary = "Mutated A";

    (metadataA.tags as any).push("Mutated");

    appA.onBeforeHandle(() => undefined);

    const secondA = inspectContract(appA);

    const snapshotB = inspectContract(appB);

    expect(secondA.routes[0]?.openapi).toEqual({
      summary: "Shared users",

      tags: ["Users"],
    });

    expect(snapshotB.routes[0]?.openapi).toEqual({
      summary: "Shared users",

      tags: ["Users"],
    });
  });
});

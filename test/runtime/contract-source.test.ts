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
});

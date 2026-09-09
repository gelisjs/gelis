import { describe, expect, test } from "bun:test";

import {
  Gelis,
  defineCapability,
  defineModule,
  definePlugin,
  inspectContract,
} from "../../src";

import type {
  Capability,
  OpenAPIRouteMetadata,
  ResponseContractMap,
  StandardSchemaV1,
} from "../../src";

interface DatabaseClient {
  readonly id: string;
}

const Database: Capability<DatabaseClient> = defineCapability(
  "module-contract-compatibility-database",
);

function databasePlugin(id: string) {
  return definePlugin(
    `module-contract-compatibility-database:${id}`,

    (setup) => {
      Database.provide(setup, {
        id,
      });
    },
  );
}

function createSchema<Input = unknown, Output = Input>(
  validate: (
    value: unknown,
  ) =>
    | StandardSchemaV1.Result<Output>
    | Promise<StandardSchemaV1.Result<Output>>,
): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1,

      vendor: "gelis-test",

      validate,
    },
  };
}

describe("module contract compatibility", () => {
  test("keeps semantic contract fields through scoped module request-scope composition", async () => {
    const Query = createSchema<
      Record<string, string | string[]>,
      {
        page: number;
      }
    >((value) => {
      const input = value as Record<string, string | string[]>;

      return {
        value: {
          page: Number(input.page),
        },
      };
    });

    const Body = createSchema<
      {
        name: string;
      },
      {
        normalizedName: string;
      }
    >((value) => {
      const input = value as {
        name: string;
      };

      return {
        value: {
          normalizedName: input.name.trim().toUpperCase(),
        },
      };
    });

    const Output = createSchema<
      {
        id: string;

        name: string;
      },
      {
        id: string;

        name: string;

        normalized: true;
      }
    >((value) => {
      const input = value as {
        id: string;

        name: string;
      };

      return {
        value: {
          ...input,

          normalized: true,
        },
      };
    });

    const responses = {
      200: {
        schema: Output,

        validate: true,
      },
    } satisfies ResponseContractMap;

    const metadata = {
      summary: "Upsert user",

      tags: ["Users"],
    } satisfies OpenAPIRouteMetadata;

    const module = defineModule(
      "/users",

      (setup) => ({
        database: Database.require(setup),
      }),

      {
        beforeHandle(_context, scope) {
          void scope.database;
        },

        afterHandle(_context, _result, scope) {
          void scope.database;
        },
      },

      (module) => {
        const requestScope = module.requestScope((context, moduleScope) => {
          const query = context.query as {
            page: number;
          };

          return {
            requestKey: `${moduleScope.database.id}:${query.page}`,
          };
        });

        return {
          upsert: requestScope.post(
            "/:id",

            {
              query: Query,

              body: Body,

              responses,

              openapi: metadata,
            },

            (
              { params, body },

              moduleScope,

              requestScope,
            ) => ({
              id: params.id,

              name: `${body.normalizedName}@${moduleScope.database.id}:${requestScope.requestKey}`,
            }),
          ),
        };
      },
    );

    const app = new Gelis();

    app.use(databasePlugin("primary"));

    app.mount(module);

    const before = inspectContract(app);

    expect(before.routes).toHaveLength(1);

    const route = before.routes[0]!;

    expect(route.method).toBe("POST");

    expect(route.path).toBe("/users/:id");

    expect(route.query).toBe(Query);

    expect(route.body).toBe(Body);

    expect(route.bodyParser).toBe("json");

    expect(route.bodyContentTypes).toBeUndefined();

    expect(route.responses).toBe(responses);

    expect(route.openapi).toEqual(metadata);

    expect(route.openapi).not.toBe(metadata);

    expect(Object.keys(route)).toEqual([
      "method",
      "path",
      "query",
      "body",
      "bodyParser",
      "bodyContentTypes",
      "responses",
      "openapi",
    ]);

    expect("moduleScope" in route).toBe(false);

    expect("requestScope" in route).toBe(false);

    expect("moduleRequestScope" in route).toBe(false);

    /*
     * Application-global lifecycle recompilation must not
     * alter the semantic contract projected from the module.
     */
    app.onBeforeHandle(() => undefined);

    app.onAfterHandle(() => {});

    const after = inspectContract(app);

    expect(after).toEqual(before);

    /*
     * The specialized module request-scope executor must still
     * preserve input transforms and executable response plans.
     */
    const response = await app.fetch(
      new Request(
        "http://gelis.test/users/42?page=2",

        {
          method: "POST",

          headers: {
            "content-type": "application/json",
          },

          body: JSON.stringify({
            name: " alice ",
          }),
        },
      ),
    );

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      id: "42",

      name: "ALICE@primary:primary:2",

      normalized: true,
    });
  });

  test("keeps shared module contract snapshots isolated across applications", () => {
    const module = defineModule(
      "/shared",

      (setup) => ({
        database: Database.require(setup),
      }),

      (module) => {
        const requestScope = module.requestScope((_context, moduleScope) => ({
          databaseId: moduleScope.database.id,
        }));

        return {
          read: requestScope.get(
            "/users",

            {
              openapi: {
                summary: "Shared users",

                tags: ["Users"],
              },
            },

            (_context, moduleScope, requestScope) =>
              `${moduleScope.database.id}:${requestScope.databaseId}`,
          ),
        };
      },
    );

    const first = new Gelis();

    const second = new Gelis();

    first.use(databasePlugin("first"));

    second.use(databasePlugin("second"));

    first.mount(module);

    second.mount(module);

    const firstSnapshot = inspectContract(first);

    const secondSnapshot = inspectContract(second);

    expect(firstSnapshot).toEqual(secondSnapshot);

    const firstOpenAPI = firstSnapshot.routes[0]?.openapi;

    const secondOpenAPI = secondSnapshot.routes[0]?.openapi;

    if (
      firstOpenAPI === undefined ||
      firstOpenAPI === false ||
      secondOpenAPI === undefined ||
      secondOpenAPI === false
    ) {
      throw new Error("Expected OpenAPI metadata");
    }

    (
      firstOpenAPI as {
        summary?: string;
      }
    ).summary = "Mutated first";

    expect(secondOpenAPI.summary).toBe("Shared users");

    const freshFirst = inspectContract(first);

    const freshFirstOpenAPI = freshFirst.routes[0]?.openapi;

    if (freshFirstOpenAPI === undefined || freshFirstOpenAPI === false) {
      throw new Error("Expected fresh OpenAPI metadata");
    }

    expect(freshFirstOpenAPI.summary).toBe("Shared users");
  });

  test("does not expose an unmounted module request-scope contract through application inspection", () => {
    const module = defineModule(
      "/unmounted",

      (module) => {
        const requestScope = module.requestScope(() => ({
          ready: true,
        }));

        return {
          read: requestScope.get(
            "/",

            () => "unmounted",
          ),
        };
      },
    );

    void module;

    const app = new Gelis();

    expect(inspectContract(app).routes).toEqual([]);
  });
});

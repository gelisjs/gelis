import { describe, expect, test } from "bun:test";

import { Gelis, defineCapability, defineModule, definePlugin } from "../../src";

import type { Capability, StandardSchemaV1 } from "../../src";

interface AuthService {
  readonly id: string;
}

const Auth: Capability<AuthService> = defineCapability(
  "module-request-scope-auth",
);

function createSchema<Input = unknown, Output = Input>(
  validate: (
    value: unknown,
  ) =>
    StandardSchemaV1.Result<Output> | Promise<StandardSchemaV1.Result<Output>>,
): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1,

      vendor: "gelis-test",

      validate,

      types: {
        input: undefined as Input,

        output: undefined as Output,
      },
    },
  };
}

function authPlugin(id: string) {
  return definePlugin(
    `module-request-scope-auth:${id}`,

    (setup) => {
      Auth.provide(setup, {
        id,
      });
    },
  );
}

describe("module request-scope integration", () => {
  test("supports request-scoped routes inside a static module with prefixed params", async () => {
    let derives = 0;

    const module = defineModule(
      "/static-request",

      (module) => {
        const requestScope = module.requestScope((context) => ({
          sequence: ++derives,

          marker: new URL(context.request.url).searchParams.get("marker"),
        }));

        return {
          read: requestScope.get(
            "/:id",

            (
              { params },

              scope,
            ) => `${params.id}:${scope.marker}:${scope.sequence}`,
          ),
        };
      },
    );

    const app = new Gelis();

    app.mount(module);

    const first = await app.fetch(
      new Request("http://gelis.test/static-request/42?marker=a"),
    );

    const second = await app.fetch(
      new Request("http://gelis.test/static-request/42?marker=b"),
    );

    expect(await first.text()).toBe("42:a:1");

    expect(await second.text()).toBe("42:b:2");

    expect(derives).toBe(2);
  });

  test("passes module scope and request scope as separate values", async () => {
    const module = defineModule(
      "/separate",

      (setup) => ({
        auth: Auth.require(setup),
      }),

      (module) => {
        const authenticated = module.requestScope((context, moduleScope) => ({
          user: `${moduleScope.auth.id}:${context.request.headers.get("x-user")}`,
        }));

        return {
          profile: authenticated.get(
            "/profile",

            (_context, moduleScope, requestScope) =>
              `${moduleScope.auth.id}|${requestScope.user}`,
          ),
        };
      },
    );

    const app = new Gelis();

    app.use(authPlugin("auth-a"));

    app.mount(module);

    const response = await app.fetch(
      new Request("http://gelis.test/separate/profile", {
        headers: {
          "x-user": "rigent",
        },
      }),
    );

    expect(await response.text()).toBe("auth-a|auth-a:rigent");
  });

  test("preserves app module request-scope and route lifecycle ordering", async () => {
    const order: string[] = [];

    const module = defineModule(
      "/ordered-request",

      {
        beforeHandle() {
          order.push("module-before");
        },

        afterHandle() {
          order.push("module-after");
        },
      },

      (module) => {
        const requestScope = module.requestScope(() => {
          order.push("derive");

          return {
            ready: true,
          };
        });

        return {
          read: requestScope.get(
            "/",

            (_context, requestScope) => {
              order.push(`handler:${requestScope.ready}`);

              return "ok";
            },

            {
              beforeHandle() {
                order.push("request-before");
              },

              afterHandle() {
                order.push("request-after");
              },
            },
          ),
        };
      },
    );

    const app = new Gelis();

    app.onBeforeHandle(() => {
      order.push("app-before");
    });

    app.onAfterHandle(() => {
      order.push("app-after");
    });

    app.mount(module);

    const response = await app.fetch(
      new Request("http://gelis.test/ordered-request"),
    );

    expect(await response.text()).toBe("ok");

    expect(order).toEqual([
      "app-before",
      "derive",
      "module-before",
      "request-before",
      "handler:true",
      "request-after",
      "module-after",
      "app-after",
    ]);
  });

  test("derives request scope before a module beforeHandle short circuit", async () => {
    const order: string[] = [];

    const module = defineModule(
      "/request-short",

      {
        beforeHandle() {
          order.push("module-before");

          return new Response("blocked", {
            status: 401,
          });
        },

        afterHandle() {
          order.push("module-after");
        },
      },

      (module) => {
        const requestScope = module.requestScope(() => {
          order.push("derive");

          return {
            ready: true,
          };
        });

        return {
          read: requestScope.get(
            "/",

            () => {
              order.push("handler");

              return "unreachable";
            },

            {
              beforeHandle() {
                order.push("request-before");
              },

              afterHandle() {
                order.push("request-after");
              },
            },
          ),
        };
      },
    );

    const app = new Gelis();

    app.mount(module);

    const response = await app.fetch(
      new Request("http://gelis.test/request-short"),
    );

    expect(response.status).toBe(401);

    expect(await response.text()).toBe("blocked");

    expect(order).toEqual(["derive", "module-before"]);
  });

  test("derives after validated and transformed input", async () => {
    const Query = createSchema<
      Record<string, string | string[]>,
      {
        page: number;
      }
    >((value) => {
      const input = value as Record<string, string | string[]>;

      if (typeof input.page !== "string") {
        return {
          issues: [
            {
              message: "Invalid page",
            },
          ],
        };
      }

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

    let deriveCalls = 0;

    const module = defineModule(
      "/validated-request",

      (module) => {
        const requestScope = module.requestScope((context) => {
          deriveCalls++;

          expect(context.query).toEqual({
            page: 2,
          });

          expect(context.body).toEqual({
            normalizedName: "ALICE",
          });

          const query = context.query as {
            page: number;
          };

          const body = context.body as {
            normalizedName: string;
          };

          return {
            identity: `${query.page}:${body.normalizedName}`,
          };
        });

        return {
          read: requestScope.post(
            "/",

            {
              query: Query,

              body: Body,
            },

            (
              { query, body },

              requestScope,
            ) => ({
              page: query.page,

              name: body.normalizedName,

              identity: requestScope.identity,
            }),
          ),
        };
      },
    );

    const app = new Gelis();

    app.mount(module);

    const response = await app.fetch(
      new Request("http://gelis.test/validated-request?page=2", {
        method: "POST",

        headers: {
          "content-type": "application/json",
        },

        body: JSON.stringify({
          name: " alice ",
        }),
      }),
    );

    expect(deriveCalls).toBe(1);

    expect(await response.json()).toEqual({
      page: 2,

      name: "ALICE",

      identity: "2:ALICE",
    });
  });

  test("preserves asynchronous derive and lifecycle ordering", async () => {
    const order: string[] = [];

    const module = defineModule(
      "/request-async",

      {
        async beforeHandle() {
          order.push("module-before:start");

          await Promise.resolve();

          order.push("module-before:end");
        },

        async afterHandle() {
          order.push("module-after:start");

          await Promise.resolve();

          order.push("module-after:end");
        },
      },

      (module) => {
        const requestScope = module.requestScope(async () => {
          order.push("derive:start");

          await Promise.resolve();

          order.push("derive:end");

          return {
            ready: true,
          };
        });

        return {
          read: requestScope.get(
            "/",

            (_context, scope) => {
              order.push(`handler:${scope.ready}`);

              return "ok";
            },
          ),
        };
      },
    );

    const app = new Gelis();

    app.mount(module);

    const response = await app.fetch(
      new Request("http://gelis.test/request-async"),
    );

    expect(await response.text()).toBe("ok");

    expect(order).toEqual([
      "derive:start",
      "derive:end",
      "module-before:start",
      "module-before:end",
      "handler:true",
      "module-after:start",
      "module-after:end",
    ]);
  });

  test("keeps reusable module scope isolated while deriving fresh request scope", async () => {
    const module = defineModule(
      "/isolated-request",

      (setup) => ({
        auth: Auth.require(setup),
      }),

      (module) => {
        const requestScope = module.requestScope((context, moduleScope) => ({
          value: `${moduleScope.auth.id}:${context.request.headers.get("x-request")}`,
        }));

        return {
          read: requestScope.get(
            "/",

            (_context, moduleScope, requestScope) =>
              `${moduleScope.auth.id}|${requestScope.value}`,
          ),
        };
      },
    );

    const first = new Gelis();

    const second = new Gelis();

    first.use(authPlugin("first"));

    second.use(authPlugin("second"));

    first.mount(module);

    second.mount(module);

    const firstResponse = await first.fetch(
      new Request("http://gelis.test/isolated-request", {
        headers: {
          "x-request": "one",
        },
      }),
    );

    const secondResponse = await second.fetch(
      new Request("http://gelis.test/isolated-request", {
        headers: {
          "x-request": "two",
        },
      }),
    );

    expect(await firstResponse.text()).toBe("first|first:one");

    expect(await secondResponse.text()).toBe("second|second:two");
  });
});

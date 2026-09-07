import { describe, expect, test } from "bun:test";

import { Gelis, defineCapability, defineModule, definePlugin } from "../../src";

import type { Capability } from "../../src";

interface DatabaseClient {
  readonly id: string;
}

const Database: Capability<DatabaseClient> = defineCapability(
  "module-lifecycle-database",
);

function databasePlugin(id: string) {
  return definePlugin(
    `module-lifecycle-database:${id}`,

    (setup) => {
      Database.provide(setup, {
        id,
      });
    },
  );
}

describe("module lifecycle composition", () => {
  test("runs module lifecycle around route-local lifecycle without affecting outside routes", async () => {
    const order: string[] = [];

    const module = defineModule(
      "/owned",

      {
        beforeHandle() {
          order.push("module-before");
        },

        afterHandle() {
          order.push("module-after");
        },
      },

      (route) => ({
        read: route.get(
          "/",

          () => {
            order.push("handler");

            return "owned";
          },

          {
            beforeHandle() {
              order.push("route-before");
            },

            afterHandle() {
              order.push("route-after");
            },
          },
        ),
      }),
    );

    const app = new Gelis();

    app.get(
      "/outside",

      () => {
        order.push("outside");

        return "outside";
      },
    );

    app.mount(module);

    const owned = await app.fetch(new Request("http://gelis.test/owned"));

    expect(await owned.text()).toBe("owned");

    expect(order).toEqual([
      "module-before",
      "route-before",
      "handler",
      "route-after",
      "module-after",
    ]);

    order.length = 0;

    const outside = await app.fetch(new Request("http://gelis.test/outside"));

    expect(await outside.text()).toBe("outside");

    expect(order).toEqual(["outside"]);
  });

  test("binds scoped module lifecycle independently for each application", async () => {
    const observed: string[] = [];

    const module = defineModule(
      "/scoped-hooks",

      (setup) => ({
        database: Database.require(setup),
      }),

      {
        beforeHandle(_context, scope) {
          observed.push(`before:${scope.database.id}`);
        },

        afterHandle(_context, _result, scope) {
          observed.push(`after:${scope.database.id}`);
        },
      },

      (route) => ({
        read: route.get(
          "/",

          (_context, scope) => {
            observed.push(`handler:${scope.database.id}`);

            return scope.database.id;
          },
        ),
      }),
    );

    const first = new Gelis();

    const second = new Gelis();

    first.use(databasePlugin("first"));

    second.use(databasePlugin("second"));

    first.mount(module);

    second.mount(module);

    const firstResponse = await first.fetch(
      new Request("http://gelis.test/scoped-hooks"),
    );

    const secondResponse = await second.fetch(
      new Request("http://gelis.test/scoped-hooks"),
    );

    expect(await firstResponse.text()).toBe("first");

    expect(await secondResponse.text()).toBe("second");

    expect(observed).toEqual([
      "before:first",
      "handler:first",
      "after:first",
      "before:second",
      "handler:second",
      "after:second",
    ]);
  });

  test("keeps application global lifecycle outside module and route lifecycle", async () => {
    const order: string[] = [];

    const module = defineModule(
      "/ordered",

      {
        beforeHandle() {
          order.push("module-before");
        },

        afterHandle() {
          order.push("module-after");
        },
      },

      (route) => ({
        read: route.get(
          "/",

          () => {
            order.push("handler");

            return "ok";
          },

          {
            beforeHandle() {
              order.push("route-before");
            },

            afterHandle() {
              order.push("route-after");
            },
          },
        ),
      }),
    );

    const app = new Gelis();

    app.onBeforeHandle(() => {
      order.push("app-before");
    });

    app.onAfterHandle(() => {
      order.push("app-after");
    });

    app.mount(module);

    await app.fetch(new Request("http://gelis.test/ordered"));

    expect(order).toEqual([
      "app-before",
      "module-before",
      "route-before",
      "handler",
      "route-after",
      "module-after",
      "app-after",
    ]);
  });

  test("preserves module lifecycle when application global hooks are added after mount", async () => {
    const order: string[] = [];

    const module = defineModule(
      "/late-global",

      {
        beforeHandle() {
          order.push("module-before");
        },

        afterHandle() {
          order.push("module-after");
        },
      },

      (route) => ({
        read: route.get(
          "/",

          () => {
            order.push("handler");

            return "ok";
          },
        ),
      }),
    );

    const app = new Gelis();

    app.mount(module);

    app.onBeforeHandle(() => {
      order.push("app-before");
    });

    app.onAfterHandle(() => {
      order.push("app-after");
    });

    await app.fetch(new Request("http://gelis.test/late-global"));

    expect(order).toEqual([
      "app-before",
      "module-before",
      "handler",
      "module-after",
      "app-after",
    ]);
  });

  test("short-circuits route execution from module beforeHandle", async () => {
    const order: string[] = [];

    const module = defineModule(
      "/short",

      {
        beforeHandle() {
          order.push("module-before");

          return new Response("blocked", {
            status: 403,
          });
        },

        afterHandle() {
          order.push("module-after");
        },
      },

      (route) => ({
        read: route.get(
          "/",

          () => {
            order.push("handler");

            return "unreachable";
          },

          {
            beforeHandle() {
              order.push("route-before");
            },

            afterHandle() {
              order.push("route-after");
            },
          },
        ),
      }),
    );

    const app = new Gelis();

    app.mount(module);

    const response = await app.fetch(new Request("http://gelis.test/short"));

    expect(response.status).toBe(403);

    expect(await response.text()).toBe("blocked");

    expect(order).toEqual(["module-before"]);
  });

  test("preserves async module lifecycle ordering", async () => {
    const order: string[] = [];

    const module = defineModule(
      "/async-hooks",

      {
        async beforeHandle() {
          order.push("before:start");

          await Promise.resolve();

          order.push("before:end");
        },

        async afterHandle() {
          order.push("after:start");

          await Promise.resolve();

          order.push("after:end");
        },
      },

      (route) => ({
        read: route.get(
          "/",

          () => {
            order.push("handler");

            return "ok";
          },
        ),
      }),
    );

    const app = new Gelis();

    app.mount(module);

    const response = await app.fetch(
      new Request("http://gelis.test/async-hooks"),
    );

    expect(await response.text()).toBe("ok");

    expect(order).toEqual([
      "before:start",
      "before:end",
      "handler",
      "after:start",
      "after:end",
    ]);
  });
});

import { describe, expect, test } from "bun:test";

import { Gelis, defineCapability, defineModule, definePlugin } from "../../src";

import type { Capability } from "../../src";

interface DatabaseClient {
  readonly name: string;

  findUser(id: string): {
    readonly id: string;

    readonly database: string;
  };
}

const Database: Capability<DatabaseClient> = defineCapability("database");

describe("module dependency binding", () => {
  test("resolves module dependencies at mount time and captures concrete references", async () => {
    let resolveCalls = 0;

    const users = defineModule(
      "/users",

      (setup) => {
        resolveCalls++;

        return {
          database: Database.require(setup),
        };
      },

      (route) => ({
        find: route.get(
          "/:id",

          ({ params }, scope) => scope.database.findUser(params.id),
        ),
      }),
    );

    expect(resolveCalls).toBe(0);

    const app = new Gelis();

    app.use(
      definePlugin("database-a", (setup) => {
        Database.provide(setup, createDatabase("a"));
      }),
    );

    app.mount(users);

    expect(resolveCalls).toBe(1);

    const first = await app.fetch(new Request("http://gelis.test/users/42"));

    expect(await first.json()).toEqual({
      id: "42",

      database: "a",
    });

    const second = await app.fetch(new Request("http://gelis.test/users/7"));

    expect(await second.json()).toEqual({
      id: "7",

      database: "a",
    });

    expect(resolveCalls).toBe(1);
  });

  test("binds one reusable module independently across applications", async () => {
    const users = defineModule(
      "/users",

      (setup) => ({
        database: Database.require(setup),
      }),

      (route) => ({
        current: route.get(
          "/current",

          (_context, scope) => ({
            database: scope.database.name,
          }),
        ),
      }),
    );

    const appA = new Gelis();

    appA.use(
      definePlugin("database-a", (setup) => {
        Database.provide(setup, createDatabase("a"));
      }),
    );

    appA.mount(users);

    const appB = new Gelis();

    appB.use(
      definePlugin("database-b", (setup) => {
        Database.provide(setup, createDatabase("b"));
      }),
    );

    appB.mount(users);

    const responseA = await appA.fetch(
      new Request("http://gelis.test/users/current"),
    );

    const responseB = await appB.fetch(
      new Request("http://gelis.test/users/current"),
    );

    expect(await responseA.json()).toEqual({
      database: "a",
    });

    expect(await responseB.json()).toEqual({
      database: "b",
    });
  });

  test("does not register module routes when dependency resolution fails", async () => {
    const users = defineModule(
      "/users",

      (setup) => ({
        database: Database.require(setup),
      }),

      (route) => ({
        current: route.get(
          "/current",

          (_context, scope) => ({
            database: scope.database.name,
          }),
        ),
      }),
    );

    const app = new Gelis();

    expect(() => {
      app.mount(users);
    }).toThrow(
      'Missing capability dependency "database" required by module "/users"',
    );

    const response = await app.fetch(
      new Request("http://gelis.test/users/current"),
    );

    expect(response.status).toBe(404);
  });

  test("binds scoped module lifecycle to the resolved module scope", async () => {
    const trace: string[] = [];

    const users = defineModule(
      "/users",

      (setup) => ({
        database: Database.require(setup),
      }),

      (route) => ({
        lifecycle: route.get(
          "/lifecycle",

          (_context, scope) => {
            trace.push(`handler:${scope.database.name}`);

            return scope.database.name;
          },

          {
            beforeHandle(_context, scope) {
              trace.push(`before:${scope.database.name}`);
            },

            afterHandle(_context, result, scope) {
              trace.push(`after:${scope.database.name}:${String(result)}`);
            },
          },
        ),
      }),
    );

    const app = new Gelis();

    app.use(
      definePlugin("database-a", (setup) => {
        Database.provide(setup, createDatabase("a"));
      }),
    );

    app.mount(users);

    const response = await app.fetch(
      new Request("http://gelis.test/users/lifecycle"),
    );

    expect(await response.text()).toBe("a");

    expect(trace).toEqual(["before:a", "handler:a", "after:a:a"]);
  });

  test("keeps existing static module construction behavior", async () => {
    const health = defineModule(
      "/health",

      (route) => ({
        read: route.get(
          "/",

          () => "ok",
        ),
      }),
    );

    const app = new Gelis();

    app.mount(health);

    const response = await app.fetch(new Request("http://gelis.test/health"));

    expect(await response.text()).toBe("ok");
  });
});

function createDatabase(name: string): DatabaseClient {
  return {
    name,

    findUser(id) {
      return {
        id,

        database: name,
      };
    },
  };
}

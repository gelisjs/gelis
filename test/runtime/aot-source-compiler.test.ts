import { describe, expect, test } from "bun:test";

import { compileAotSource } from "../../src/tooling/aot-source-compiler";

class FakeGelis {
  onRequest(_hook: unknown): this {
    return this;
  }

  onError(_hook: unknown): this {
    return this;
  }

  onBeforeHandle(_hook: unknown): this {
    return this;
  }
}

describe("Gelis AOT source compiler", () => {
  test("compiles source routes into a semantic plan", async () => {
    const result = await compileAotSource(`
      const app = new Gelis();

      app.get(
        "/first",
        () => "first",
      );

      app.post(
        "/users/:id",
        () => "second",
      );
    `);

    expect(result.routeCount).toBe(2);

    expect(result.plan?.routeCount).toBe(2);

    expect(
      result.plan?.routes.map((route) => ({
        method: route.method,
        path: route.path,
      })),
    ).toEqual([
      {
        method: "GET",
        path: "/first",
      },
      {
        method: "POST",
        path: "/users/:id",
      },
    ]);

    expect(result.plan?.shapeFingerprint.length).toBe(64);
  });

  test("rewrites route registration and inserts the installer", async () => {
    const result = await compileAotSource(`
      const app = new Gelis();

      app.get(
        "/first",
        () => "first",
      );
    `);

    expect(result.code).toContain("const __gelisAotHandlers = new Array(1);");

    expect(result.code).toContain('__gelisAotHandlers[0] = () => "first";');

    expect(result.code).toContain(
      "__gelisAotInstall(app, __gelisAotHandlers);",
    );

    expect(result.code).not.toContain("app.get(");
  });

  test("installs only after every handler has been acquired", async () => {
    const events: string[] = [];

    const result = await compileAotSource(`
      const app = new Gelis();

      const make = (name) => {
        events.push("make:" + name);

        return () => name;
      };

      app.get(
        "/first",
        make("first"),
      );

      app.get(
        "/second",
        make("second"),
      );
    `);

    execute(result.code, events);

    expect(events).toEqual(["make:first", "make:second", "install:2"]);
  });

  test("preserves side effects before the first post-route app use", async () => {
    const events: string[] = [];

    const result = await compileAotSource(`
      const app = new Gelis();

      app.get(
        "/route",
        () => "ok",
      );

      events.push("ordinary-side-effect");

      app.onBeforeHandle(
        () => undefined,
      );

      events.push("after-app-use");
    `);

    execute(result.code, events);

    expect(events).toEqual([
      "ordinary-side-effect",
      "install:1",
      "after-app-use",
    ]);
  });

  test("preserves pre-install application wrappers", async () => {
    const events: string[] = [];

    const result = await compileAotSource(`
      const app = new Gelis();

      events.push("before-request-hook");

      app.onRequest(
        () => undefined,
      );

      app.get(
        "/route",
        () => "ok",
      );

      events.push("after-route");
    `);

    execute(result.code, events);

    expect(events).toEqual(["before-request-hook", "after-route", "install:1"]);
  });

  test("rejects installer identifier collisions", async () => {
    await expect(
      compileAotSource(`
        const __gelisAotInstall = () => {};

        const app = new Gelis();

        app.get(
          "/route",
          () => "ok",
        );
      `),
    ).rejects.toThrow(
      "internal AOT identifier __gelisAotInstall already exists",
    );
  });

  test("leaves zero-route source unchanged", async () => {
    const source = `
      const app = new Gelis();

      const value = 123;
    `;

    const result = await compileAotSource(source);

    expect(result.routeCount).toBe(0);

    expect(result.plan).toBeUndefined();

    expect(result.installBeforeOffset).toBeUndefined();

    expect(result.code).toBe(source);
  });
});

function execute(
  code: string,

  events: string[],
): void {
  const run = new Function("Gelis", "events", "__gelisAotInstall", code);

  run(
    FakeGelis,

    events,

    (
      _app: unknown,

      handlers: readonly Function[],
    ) => {
      events.push(`install:${handlers.length}`);
    },
  );
}

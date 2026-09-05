import { describe, expect, test } from "bun:test";

import { rewriteAotSource } from "../../src/tooling/aot-source-rewriter";

class FakeGelis {
  get(_path: string, _handler: unknown): void {}

  post(_path: string, _handler: unknown): void {}
}

describe("Gelis AOT source rewriter", () => {
  test("replaces route registration with handler slots", () => {
    const result = rewriteAotSource(`
            const app = new Gelis();

            app.get(
              "/first",
              () => "first",
            );

            app.post(
              "/second",
              () => "second",
            );
          `);

    expect(result.routeCount).toBe(2);

    expect(result.code).toContain("const __gelisAotHandlers = new Array(2);");

    expect(result.code).toContain('__gelisAotHandlers[0] = () => "first";');

    expect(result.code).toContain('__gelisAotHandlers[1] = () => "second";');

    expect(result.code).not.toContain("app.get(");

    expect(result.code).not.toContain("app.post(");
  });

  test("preserves lexical bindings", () => {
    const result = rewriteAotSource(`
            const app = new Gelis();

            let value = 1;

            app.get(
              "/first",
              () => value,
            );

            value = 2;

            app.get(
              "/second",
              () => value * 2,
            );
          `);

    const handlers = execute(result);

    expect(handlers[0]?.()).toBe(2);

    expect(handlers[1]?.()).toBe(4);
  });

  test("preserves handler expression evaluation order", () => {
    const events: string[] = [];

    const result = rewriteAotSource(`
            const app = new Gelis();

            const make = (name) => {
              events.push("make:" + name);

              return () => name;
            };

            events.push("before");

            app.get(
              "/first",
              make("first"),
            );

            events.push("middle");

            app.post(
              "/second",
              make("second"),
            );

            events.push("after");
          `);

    execute(result, events);

    expect(events).toEqual([
      "before",
      "make:first",
      "middle",
      "make:second",
      "after",
    ]);
  });

  test("evaluates each handler expression exactly once", () => {
    const events: string[] = [];

    const result = rewriteAotSource(`
            const app = new Gelis();

            const make = (name) => {
              events.push(name);

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

    const handlers = execute(result, events);

    expect(events).toEqual(["first", "second"]);

    expect(handlers[0]).not.toBe(handlers[1]);
  });

  test("preserves handler acquisition exceptions", () => {
    const marker = new Error("handler acquisition");

    const result = rewriteAotSource(`
            const app = new Gelis();

            app.get(
              "/route",
              make(),
            );
          `);

    const executeThrowing = new Function(
      "Gelis",
      "make",
      `
              ${result.code}

              return ${result.handlerArrayIdentifier};
            `,
    );

    expect(() =>
      executeThrowing(FakeGelis, () => {
        throw marker;
      }),
    ).toThrow(marker);
  });

  test("rejects internal identifier collisions", () => {
    expect(() =>
      rewriteAotSource(`
              const __gelisAotHandlers = [];

              const app = new Gelis();

              app.get(
                "/route",
                () => "ok",
              );
            `),
    ).toThrow("internal AOT identifier __gelisAotHandlers already exists");
  });

  test("leaves a zero-route application unchanged", () => {
    const source = `
          const app = new Gelis();

          const value = 123;
        `;

    const result = rewriteAotSource(source);

    expect(result.routeCount).toBe(0);

    expect(result.code).toBe(source);
  });
});

function execute(
  result: ReturnType<typeof rewriteAotSource>,

  events: string[] = [],
): Function[] {
  const run = new Function(
    "Gelis",
    "events",
    `
        ${result.code}

        return ${result.handlerArrayIdentifier};
      `,
  );

  return run(FakeGelis, events) as Function[];
}

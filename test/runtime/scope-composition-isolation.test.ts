import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

describe("scope composition isolation", () => {
  test("allows separate application scopes to reuse the same property name without collision", async () => {
    const app = new Gelis();

    const first = app.scope({
      service: "first",
    } as const);

    const second = app.scope({
      service: "second",
    } as const);

    first.get(
      "/application/first",

      (_context, scope) => ({
        service: scope.service,

        keys: Object.keys(scope),
      }),
    );

    second.get(
      "/application/second",

      (_context, scope) => ({
        service: scope.service,

        keys: Object.keys(scope),
      }),
    );

    const firstResponse = await app.fetch(
      new Request("http://gelis.test/application/first"),
    );

    const secondResponse = await app.fetch(
      new Request("http://gelis.test/application/second"),
    );

    expect(await firstResponse.json()).toEqual({
      service: "first",

      keys: ["service"],
    });

    expect(await secondResponse.json()).toEqual({
      service: "second",

      keys: ["service"],
    });
  });

  test("allows separate request scopes to reuse the same property name without collision", async () => {
    const app = new Gelis();

    const first = app.requestScope(
      () =>
        ({
          service: "first",
        }) as const,
    );

    const second = app.requestScope(
      () =>
        ({
          service: "second",
        }) as const,
    );

    first.get(
      "/request/first",

      (_context, scope) => ({
        service: scope.service,

        keys: Object.keys(scope),
      }),
    );

    second.get(
      "/request/second",

      (_context, scope) => ({
        service: scope.service,

        keys: Object.keys(scope),
      }),
    );

    const firstResponse = await app.fetch(
      new Request("http://gelis.test/request/first"),
    );

    const secondResponse = await app.fetch(
      new Request("http://gelis.test/request/second"),
    );

    expect(await firstResponse.json()).toEqual({
      service: "first",

      keys: ["service"],
    });

    expect(await secondResponse.json()).toEqual({
      service: "second",

      keys: ["service"],
    });
  });

  test("does not implicitly merge application and request scope namespaces", async () => {
    const app = new Gelis();

    const applicationRoutes = app.scope({
      identity: "application",

      applicationOnly: true,
    } as const);

    const requestRoutes = app.requestScope(
      () =>
        ({
          identity: "request",

          requestOnly: true,
        }) as const,
    );

    applicationRoutes.get(
      "/lifetime/application",

      (_context, scope) => ({
        identity: scope.identity,

        keys: Object.keys(scope).sort(),
      }),
    );

    requestRoutes.get(
      "/lifetime/request",

      (_context, scope) => ({
        identity: scope.identity,

        keys: Object.keys(scope).sort(),
      }),
    );

    const applicationResponse = await app.fetch(
      new Request("http://gelis.test/lifetime/application"),
    );

    const requestResponse = await app.fetch(
      new Request("http://gelis.test/lifetime/request"),
    );

    expect(await applicationResponse.json()).toEqual({
      identity: "application",

      keys: ["applicationOnly", "identity"],
    });

    expect(await requestResponse.json()).toEqual({
      identity: "request",

      keys: ["identity", "requestOnly"],
    });
  });

  test("keeps ordinary routes outside every scoped builder", async () => {
    const app = new Gelis();

    app
      .scope({
        marker: "application",
      })
      .get(
        "/scoped/application",

        (_context, scope) => scope.marker,
      );

    app
      .requestScope(() => ({
        marker: "request",
      }))
      .get(
        "/scoped/request",

        (_context, scope) => scope.marker,
      );

    app.get(
      "/plain",

      (context, ...extra: unknown[]) => ({
        method: context.request.method,

        extraArguments: extra.length,
      }),
    );

    const response = await app.fetch(new Request("http://gelis.test/plain"));

    expect(await response.json()).toEqual({
      method: "GET",

      extraArguments: 0,
    });
  });

  test("keeps interleaved asynchronous request scopes isolated between concurrent requests", async () => {
    const app = new Gelis();

    const order: string[] = [];

    const releases = new Map<string, () => void>();

    const scopes = new Map<
      string,
      {
        readonly requestId: string;
      }
    >();

    const routes = app.requestScope(async ({ params }) => {
      const id = params.id;

      if (id === undefined) {
        throw new Error("Missing request id");
      }

      order.push(`derive-start:${id}`);

      await new Promise<void>((resolve) => {
        releases.set(id, resolve);
      });

      const scope = {
        requestId: id,
      };

      scopes.set(id, scope);

      order.push(`derive-end:${id}`);

      return scope;
    });

    routes.get(
      "/concurrent/:id",

      ({ params }, scope) => {
        order.push(`handler:${params.id}:${scope.requestId}`);

        const expectedScope = scopes.get(params.id);

        expect(expectedScope).toBeDefined();

        if (expectedScope === undefined) {
          throw new Error(`Missing stored scope for ${params.id}`);
        }

        expect(scope).toBe(expectedScope);

        return scope.requestId;
      },

      {
        beforeHandle({ params }, scope) {
          order.push(`before:${params.id}:${scope.requestId}`);

          const expectedScope = scopes.get(params.id);

          expect(expectedScope).toBeDefined();

          if (expectedScope === undefined) {
            throw new Error(`Missing stored scope for ${params.id}`);
          }

          expect(scope).toBe(expectedScope);
        },

        afterHandle({ params }, result, scope) {
          order.push(`after:${params.id}:${scope.requestId}:${result}`);

          const expectedScope = scopes.get(params.id);

          expect(expectedScope).toBeDefined();

          if (expectedScope === undefined) {
            throw new Error(`Missing stored scope for ${params.id}`);
          }

          expect(scope).toBe(expectedScope);
        },
      },
    );

    const first = app.fetch(new Request("http://gelis.test/concurrent/first"));

    const second = app.fetch(
      new Request("http://gelis.test/concurrent/second"),
    );

    expect(first).toBeInstanceOf(Promise);

    expect(second).toBeInstanceOf(Promise);

    expect(order).toEqual(["derive-start:first", "derive-start:second"]);

    release(releases, "second");

    const secondResponse = await second;

    expect(await secondResponse.text()).toBe("second");

    expect(order).toEqual([
      "derive-start:first",
      "derive-start:second",
      "derive-end:second",
      "before:second:second",
      "handler:second:second",
      "after:second:second:second",
    ]);

    release(releases, "first");

    const firstResponse = await first;

    expect(await firstResponse.text()).toBe("first");

    expect(order).toEqual([
      "derive-start:first",
      "derive-start:second",
      "derive-end:second",
      "before:second:second",
      "handler:second:second",
      "after:second:second:second",
      "derive-end:first",
      "before:first:first",
      "handler:first:first",
      "after:first:first:first",
    ]);

    expect(scopes.get("first")).not.toBe(scopes.get("second"));
  });
});

function release(
  releases: ReadonlyMap<string, () => void>,

  id: string,
): void {
  const resolve = releases.get(id);

  if (resolve === undefined) {
    throw new Error(`Missing release for ${id}`);
  }

  resolve();
}

import { describe, expect, test } from "bun:test";

import { defineModule, Gelis } from "../../src";

import { createAotAppSession } from "../../src/tooling/aot-app";

import { compileRouterSnapshot } from "../../src/tooling/router-snapshot-compiler";

const module = defineModule(
  "/module",

  (route) => ({
    item: route.get(
      "/items/:id",

      ({ params }) => `module:${params.id}`,
    ),
  }),
);

describe("Gelis AOT application session", () => {
  test("replays normal declarations without Router.register", async () => {
    /*
     * Build-time declaration execution.
     *
     * Handler identity/content is deliberately
     * different from runtime.
     */
    const build = createAotAppSession();

    defineApplication(build.app, "build");

    const buildRoutes = build.collectRoutes();

    const snapshot = compileRouterSnapshot(buildRoutes);

    /*
     * Runtime declaration execution.
     *
     * Same routing shape, but real runtime
     * handlers and closures.
     */
    const runtime = createAotAppSession();

    defineApplication(runtime.app, "runtime");

    runtime.hydrate(snapshot);

    expect(await text(runtime.app, "/health")).toBe("runtime:health");

    expect(await text(runtime.app, "/users/42")).toBe("runtime:user:42");

    expect(await text(runtime.app, "/users/42/details")).toBe(
      "runtime:details:42",
    );

    expect(await text(runtime.app, "/module/items/99")).toBe("module:99");
  });

  test("cannot serve requests before hydration", () => {
    const session = createAotAppSession();

    defineApplication(session.app, "runtime");

    expect(() => session.app.fetch(request("/health"))).toThrow(
      "before router hydration",
    );
  });

  test("keeps normal Gelis behavior independent", async () => {
    const app = new Gelis();

    defineApplication(app, "normal");

    expect(await text(app, "/users/7")).toBe("normal:user:7");
  });
});

function defineApplication(
  app: Gelis,

  identity: string,
): void {
  app.get(
    "/health",

    () => `${identity}:health`,
  );

  app.get(
    "/users/:id",

    ({ params }) => `${identity}:user:${params.id}`,
  );

  /*
   * Forces GET into generic trie mode.
   */
  app.get(
    "/users/:id/details",

    ({ params }) => `${identity}:details:${params.id}`,
  );

  app.mount(module);
}

async function text(
  app: Gelis,

  pathname: string,
): Promise<string> {
  const response = await app.fetch(request(pathname));

  return response.text();
}

function request(pathname: string): Request {
  return new Request(`http://localhost${pathname}`);
}

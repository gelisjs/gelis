import { describe, expect, test } from "bun:test";

import { Gelis, ModuleMountError, defineModule } from "../../src";

describe("module atomic mount and duplicate semantics", () => {
  test("rejects the same module object twice on one application", () => {
    const module = defineModule(
      "/duplicate-module",

      (route) => ({
        read: route.get("/", () => "ok"),
      }),
    );

    const app = new Gelis();

    app.mount(module);

    let thrown: unknown;

    try {
      app.mount(module);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ModuleMountError);

    const error = thrown as ModuleMountError;

    expect(error.code).toBe("MODULE_ALREADY_MOUNTED");

    expect(error.modulePrefix).toBe("/duplicate-module");
  });

  test("allows the same module object on separate applications", async () => {
    const module = defineModule(
      "/shared-module",

      (route) => ({
        read: route.get("/", () => "shared"),
      }),
    );

    const first = new Gelis();

    const second = new Gelis();

    first.mount(module);

    second.mount(module);

    const firstResponse = await first.fetch(
      new Request("http://gelis.test/shared-module"),
    );

    const secondResponse = await second.fetch(
      new Request("http://gelis.test/shared-module"),
    );

    expect(await firstResponse.text()).toBe("shared");

    expect(await secondResponse.text()).toBe("shared");
  });

  test("rejects a re-entrant mount of the same module object", async () => {
    const app = new Gelis();

    let reentrantError: unknown;

    const module = defineModule(
      "/reentrant-module",

      () => {
        try {
          app.mount(module);
        } catch (error) {
          reentrantError = error;
        }

        return {
          ready: true,
        };
      },

      (route) => ({
        read: route.get("/", (_context, scope) => scope.ready),
      }),
    );

    app.mount(module);

    expect(reentrantError).toBeInstanceOf(ModuleMountError);

    expect((reentrantError as ModuleMountError).code).toBe(
      "MODULE_ALREADY_MOUNTED",
    );

    const response = await app.fetch(
      new Request("http://gelis.test/reentrant-module"),
    );

    expect(await response.json()).toBe(true);
  });

  test("allows different module objects with the same prefix when routes do not collide", async () => {
    const first = defineModule(
      "/same-prefix",

      (route) => ({
        first: route.get("/first", () => "first"),
      }),
    );

    const second = defineModule(
      "/same-prefix",

      (route) => ({
        second: route.get("/second", () => "second"),
      }),
    );

    const app = new Gelis();

    app.mount(first);

    app.mount(second);

    const firstResponse = await app.fetch(
      new Request("http://gelis.test/same-prefix/first"),
    );

    const secondResponse = await app.fetch(
      new Request("http://gelis.test/same-prefix/second"),
    );

    expect(await firstResponse.text()).toBe("first");

    expect(await secondResponse.text()).toBe("second");
  });

  test("prevalidates the complete module batch against installed routes", async () => {
    const app = new Gelis();

    app.get("/atomic/existing", () => "existing");

    const module = defineModule(
      "/atomic",

      (route) => ({
        first: route.get("/first", () => "first"),

        collision: route.get("/existing", () => "module"),

        last: route.get("/last", () => "last"),
      }),
    );

    expect(() => app.mount(module)).toThrow("Duplicate route");

    const firstResponse = await app.fetch(
      new Request("http://gelis.test/atomic/first"),
    );

    const existingResponse = await app.fetch(
      new Request("http://gelis.test/atomic/existing"),
    );

    const lastResponse = await app.fetch(
      new Request("http://gelis.test/atomic/last"),
    );

    expect(firstResponse.status).toBe(404);

    expect(await existingResponse.text()).toBe("existing");

    expect(lastResponse.status).toBe(404);
  });

  test("prevalidates equivalent dynamic routes inside one module", async () => {
    const app = new Gelis();

    const module = defineModule(
      "/internal-duplicate",

      (route) => ({
        safe: route.get("/safe", () => "safe"),

        first: route.get("/:id", () => "first"),

        second: route.get("/:name", () => "second"),
      }),
    );

    expect(() => app.mount(module)).toThrow("Duplicate route");

    const safeResponse = await app.fetch(
      new Request("http://gelis.test/internal-duplicate/safe"),
    );

    const dynamicResponse = await app.fetch(
      new Request("http://gelis.test/internal-duplicate/value"),
    );

    expect(safeResponse.status).toBe(404);

    expect(dynamicResponse.status).toBe(404);
  });
});

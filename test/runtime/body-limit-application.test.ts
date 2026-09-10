import { describe, expect, test } from "bun:test";

import {
  Gelis,
  PluginInstallError,
  defineModule,
  definePlugin,
} from "../../src";
import { bodyLimit } from "../../src/body-limit";

const textSchema = {
  "~standard": {
    version: 1 as const,
    vendor: "gelis-test",
    validate(value: unknown) {
      return typeof value === "string"
        ? { value }
        : { issues: [{ message: "Expected string" }] };
    },
  },
};

function textRequest(path: string, body: string): Request {
  return new Request(`http://gelis.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
    },
    body,
  });
}

function registerTextRoute(
  app: Gelis,
  path: string,
  routeBodyLimit?: number,
): void {
  app.post(
    path,
    {
      body: textSchema,
      bodyParser: "text",
      ...(routeBodyLimit === undefined ? {} : { bodyLimit: routeBodyLimit }),
    },
    ({ body }) => body,
  );
}

describe("Gelis application body-limit specialization", () => {
  test("recompiles existing managed routes and specializes future routes", async () => {
    const app = new Gelis();

    registerTextRoute(app, "/before");

    app.use(bodyLimit({ maxBytes: 3 }));

    registerTextRoute(app, "/after");

    const beforeExact = await app.fetch(textRequest("/before", "abc"));
    const afterExact = await app.fetch(textRequest("/after", "abc"));
    const beforeOver = await app.fetch(textRequest("/before", "abcd"));
    const afterOver = await app.fetch(textRequest("/after", "abcd"));

    expect(beforeExact.status).toBe(200);
    expect(await beforeExact.text()).toBe("abc");
    expect(afterExact.status).toBe(200);
    expect(await afterExact.text()).toBe("abc");
    expect(beforeOver.status).toBe(413);
    expect(afterOver.status).toBe(413);
  });

  test("uses the stricter application or route limit", async () => {
    const app = new Gelis();

    registerTextRoute(app, "/route-stricter", 2);
    registerTextRoute(app, "/application-stricter", 8);

    app.use(bodyLimit({ maxBytes: 3 }));

    const routeStricter = await app.fetch(
      textRequest("/route-stricter", "abc"),
    );
    const applicationStricter = await app.fetch(
      textRequest("/application-stricter", "abcd"),
    );

    expect(routeStricter.status).toBe(413);
    expect(applicationStricter.status).toBe(413);
  });

  test("passes the effective limit to a custom overflow handler", async () => {
    const seen: Array<[string, number]> = [];
    const app = new Gelis();

    registerTextRoute(app, "/tight", 2);
    registerTextRoute(app, "/app", 9);

    app.use(
      bodyLimit({
        maxBytes: 4,
        onExceeded(request, maxBytes) {
          seen.push([new URL(request.url).pathname, maxBytes]);

          return new Response(`limited:${maxBytes}`, { status: 429 });
        },
      }),
    );

    const tight = await app.fetch(textRequest("/tight", "abc"));
    const application = await app.fetch(textRequest("/app", "abcde"));

    expect(tight.status).toBe(429);
    expect(await tight.text()).toBe("limited:2");
    expect(application.status).toBe(429);
    expect(await application.text()).toBe("limited:4");
    expect(seen).toEqual([
      ["/tight", 2],
      ["/app", 4],
    ]);
  });

  test("supports asynchronous overflow responses", async () => {
    const app = new Gelis();

    registerTextRoute(app, "/async");

    app.use(
      bodyLimit({
        maxBytes: 1,
        async onExceeded(_request, maxBytes) {
          await Promise.resolve();
          return new Response(`async:${maxBytes}`, { status: 431 });
        },
      }),
    );

    const response = await app.fetch(textRequest("/async", "ab"));

    expect(response.status).toBe(431);
    expect(await response.text()).toBe("async:1");
  });

  test("routes overflow-handler failures through application onError", async () => {
    const failure = new Error("overflow policy failed");
    const app = new Gelis();

    registerTextRoute(app, "/error");

    app.onError(({ error }) => {
      expect(error).toBe(failure);
      return new Response("handled", { status: 598 });
    });

    app.use(
      bodyLimit({
        maxBytes: 1,
        onExceeded() {
          throw failure;
        },
      }),
    );

    const response = await app.fetch(textRequest("/error", "ab"));

    expect(response.status).toBe(598);
    expect(await response.text()).toBe("handled");
  });

  test("specializes module and plugin routes registered after installation", async () => {
    const module = defineModule("/module", (route) => ({
      write: route.post(
        "/write",
        { body: textSchema, bodyParser: "text" },
        ({ body }) => body,
      ),
    }));

    const plugin = definePlugin("body-limit-test-routes", (context) => {
      context.routes.post(
        "/plugin/write",
        { body: textSchema, bodyParser: "text" },
        ({ body }) => body,
      );
    });

    const app = new Gelis();

    app.use(bodyLimit({ maxBytes: 2 }));
    app.mount(module);
    app.use(plugin);

    const moduleResponse = await app.fetch(textRequest("/module/write", "abc"));
    const pluginResponse = await app.fetch(textRequest("/plugin/write", "abc"));

    expect(moduleResponse.status).toBe(413);
    expect(pluginResponse.status).toBe(413);
  });

  test("recompiles managed module routes mounted before installation", async () => {
    const module = defineModule("/existing-module", (route) => ({
      write: route.post(
        "/write",
        { body: textSchema, bodyParser: "text" },
        ({ body }) => body,
      ),
    }));

    const app = new Gelis();

    app.mount(module);
    app.use(bodyLimit({ maxBytes: 2 }));

    const response = await app.fetch(
      textRequest("/existing-module/write", "abc"),
    );

    expect(response.status).toBe(413);
  });

  test("does not claim automatic enforcement for raw unmanaged bodies", async () => {
    const app = new Gelis();

    app.post("/raw", async ({ request }) => (await request.text()).length);
    app.use(bodyLimit({ maxBytes: 1 }));

    const response = await app.fetch(textRequest("/raw", "abcd"));

    expect(response.status).toBe(200);
    expect(await response.json()).toBe(4);
  });

  test("rejects duplicate application body-limit policy without replacing the first", async () => {
    const app = new Gelis();

    registerTextRoute(app, "/duplicate");
    app.use(bodyLimit({ maxBytes: 2 }));

    let thrown: unknown;

    try {
      app.use(bodyLimit({ maxBytes: 99 }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PluginInstallError);
    expect((thrown as PluginInstallError).code).toBe(
      "PLUGIN_CAPABILITY_ALREADY_PROVIDED",
    );

    const response = await app.fetch(textRequest("/duplicate", "abc"));

    expect(response.status).toBe(413);
  });

  test("validates application options before plugin installation", () => {
    for (const maxBytes of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => bodyLimit({ maxBytes })).toThrow(TypeError);
    }

    expect(() =>
      bodyLimit({
        maxBytes: 1,
        onExceeded: 123 as never,
      }),
    ).toThrow(TypeError);
  });
});

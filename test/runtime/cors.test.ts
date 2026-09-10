import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";
import { cors } from "../../src/cors/index";

const ORIGIN = "https://client.example";
const OTHER_ORIGIN = "https://other.example";

describe("P11-D CORS actual responses", () => {
  test("leaves requests without Origin without CORS grant headers", async () => {
    const app = new Gelis();
    app.use(cors());
    app.get("/resource", () => "ok");

    const response = await dispatch(app, "/resource");

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("grants wildcard simple requests", async () => {
    const app = new Gelis();
    app.use(cors());
    app.get("/resource", () => "ok");

    const response = await dispatch(app, "/resource", {
      headers: { Origin: ORIGIN },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("vary")).toBeNull();
  });

  test("supports fixed origins and denies non-matching origins", async () => {
    const app = new Gelis();
    app.use(cors({ origin: ORIGIN }));
    app.get("/resource", () => "ok");

    const allowed = await dispatch(app, "/resource", {
      headers: { Origin: ORIGIN },
    });
    const denied = await dispatch(app, "/resource", {
      headers: { Origin: OTHER_ORIGIN },
    });

    expect(allowed.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(varyTokens(allowed)).toContain("origin");
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    expect(varyTokens(denied)).toContain("origin");
  });

  test("supports exact origin allowlists", async () => {
    const app = new Gelis();
    app.use(cors({ origin: [ORIGIN, OTHER_ORIGIN] }));
    app.get("/resource", () => "ok");

    const response = await dispatch(app, "/resource", {
      headers: { Origin: OTHER_ORIGIN },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe(
      OTHER_ORIGIN,
    );
  });

  test("supports synchronous and asynchronous origin resolvers once per request", async () => {
    let syncCalls = 0;
    const syncApp = new Gelis();
    syncApp.use(
      cors({
        origin(origin) {
          syncCalls++;
          return origin === ORIGIN;
        },
      }),
    );
    syncApp.get("/resource", () => "ok");

    const syncResponse = await dispatch(syncApp, "/resource", {
      headers: { Origin: ORIGIN },
    });

    expect(syncResponse.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(syncCalls).toBe(1);

    let asyncCalls = 0;
    const asyncApp = new Gelis();
    asyncApp.use(
      cors({
        async origin(origin) {
          asyncCalls++;
          await Promise.resolve();
          return origin === ORIGIN;
        },
      }),
    );
    asyncApp.get("/resource", () => "ok");

    const asyncResponse = await dispatch(asyncApp, "/resource", {
      headers: { Origin: ORIGIN },
    });

    expect(asyncResponse.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(asyncCalls).toBe(1);
  });

  test("routes origin resolver failures through onError without resolver retry", async () => {
    let calls = 0;
    const app = new Gelis();

    app.use(
      cors({
        origin() {
          calls++;
          throw new Error("origin failed");
        },
      }),
    );
    app.onError(() => new Response("handled", { status: 598 }));
    app.get("/resource", () => "ok");

    const response = await dispatch(app, "/resource", {
      headers: { Origin: ORIGIN },
    });

    expect(response.status).toBe(598);
    expect(await response.text()).toBe("handled");
    expect(calls).toBe(1);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(varyTokens(response)).toContain("origin");
  });

  test("supports credentials and exposed headers with explicit origin", async () => {
    const app = new Gelis();
    app.use(
      cors({
        origin: ORIGIN,
        credentials: true,
        exposeHeaders: ["X-Request-Id", "ETag"],
      }),
    );
    app.get("/resource", () => "ok");

    const response = await dispatch(app, "/resource", {
      headers: { Origin: ORIGIN },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-expose-headers")).toBe(
      "X-Request-Id, ETag",
    );
  });

  test("rejects wildcard credentials and invalid maxAge configuration", () => {
    const wildcardOptions = {
      origin: "*",
      credentials: true,
    } as const;

    expect(() => Reflect.apply(cors, undefined, [wildcardOptions])).toThrow(
      TypeError,
    );
    expect(() => cors({ maxAge: -1 })).toThrow(TypeError);
    expect(() => cors({ maxAge: 1.5 })).toThrow(TypeError);
    expect(() => cors({ maxAge: Number.POSITIVE_INFINITY })).toThrow(TypeError);
  });

  test("does not grant wildcard policy to opaque null origin", async () => {
    const wildcard = new Gelis();
    wildcard.use(cors());
    wildcard.get("/resource", () => "ok");

    const denied = await dispatch(wildcard, "/resource", {
      headers: { Origin: "null" },
    });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();

    const explicit = new Gelis();
    explicit.use(cors({ origin: "null" }));
    explicit.get("/resource", () => "ok");

    const allowed = await dispatch(explicit, "/resource", {
      headers: { Origin: "null" },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("null");
  });

  test("fails closed for malformed incoming origins", async () => {
    const app = new Gelis();
    app.use(cors());
    app.get("/resource", () => "ok");

    const response = await dispatch(app, "/resource", {
      headers: { Origin: "https://example.test/path" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("applies CORS to 404 and 405 responses", async () => {
    const app = new Gelis();
    app.use(cors());
    app.get("/resource", () => "ok");

    const notFound = await dispatch(app, "/missing", {
      headers: { Origin: ORIGIN },
    });
    const methodNotAllowed = await dispatch(app, "/resource", {
      method: "POST",
      headers: { Origin: ORIGIN },
    });

    expect(notFound.status).toBe(404);
    expect(notFound.headers.get("access-control-allow-origin")).toBe("*");
    expect(methodNotAllowed.status).toBe(405);
    expect(methodNotAllowed.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("applies CORS to handled route errors exactly once", async () => {
    const app = new Gelis();
    let resolverCalls = 0;

    app.use(
      cors({
        origin(origin) {
          resolverCalls++;
          return origin === ORIGIN;
        },
      }),
    );
    app.onError(() => new Response("recovered", { status: 597 }));
    app.get("/resource", () => {
      throw new Error("route failed");
    });

    const response = await dispatch(app, "/resource", {
      headers: { Origin: ORIGIN },
    });

    expect(response.status).toBe(597);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(resolverCalls).toBe(1);
    expect(varyTokens(response).filter((token) => token === "origin")).toHaveLength(1);
  });

  test("preserves HEAD suppression while applying CORS headers", async () => {
    const app = new Gelis();
    app.use(cors());
    app.get("/resource", () => "body");

    const response = await dispatch(app, "/resource", {
      method: "HEAD",
      headers: { Origin: ORIGIN },
    });

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("rejects duplicate CORS policy without corrupting the first policy", async () => {
    const app = new Gelis();
    app.use(cors());

    expect(() => app.use(cors({ origin: ORIGIN }))).toThrow();

    app.get("/resource", () => "ok");
    const response = await dispatch(app, "/resource", {
      headers: { Origin: OTHER_ORIGIN },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("P11-D CORS preflight and method topology", () => {
  test("terminates valid preflight before ordinary onRequest and route handlers", async () => {
    const app = new Gelis();
    let onRequestCalls = 0;
    let handlerCalls = 0;

    app.use(cors());
    app.onRequest(() => {
      onRequestCalls++;
    });
    app.post("/resource", () => {
      handlerCalls++;
      return "ok";
    });

    const response = await preflight(app, "/resource", "POST");

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(onRequestCalls).toBe(0);
    expect(handlerCalls).toBe(0);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(methodTokens(response)).toContain("POST");
  });

  test("keeps ordinary P9 OPTIONS semantics when request is not a preflight", async () => {
    const app = new Gelis();
    app.use(cors());
    app.get("/resource", () => "ok");

    const ordinary = await dispatch(app, "/resource", { method: "OPTIONS" });
    expect(ordinary.status).toBe(204);
    expect(ordinary.headers.get("allow")).toContain("GET");
    expect(ordinary.headers.get("access-control-allow-origin")).toBeNull();

    const withOrigin = await dispatch(app, "/resource", {
      method: "OPTIONS",
      headers: { Origin: ORIGIN },
    });
    expect(withOrigin.status).toBe(204);
    expect(withOrigin.headers.get("allow")).toContain("GET");
    expect(withOrigin.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("derives GET, implicit HEAD, QUERY, custom methods, and OPTIONS", async () => {
    const app = new Gelis();
    app.use(cors());
    app.get("/resource", () => "get");
    app.query("/resource", () => "query");
    app.route("PROPFIND", "/resource", () => "propfind");

    const response = await preflight(app, "/resource", "PROPFIND");
    const methods = methodTokens(response);

    expect(methods).toContain("GET");
    expect(methods).toContain("HEAD");
    expect(methods).toContain("OPTIONS");
    expect(methods).toContain("QUERY");
    expect(methods).toContain("PROPFIND");
  });

  test("supports ALL without executing its handler or exposing internal marker", async () => {
    const app = new Gelis();
    let handlerCalls = 0;

    app.use(cors());
    app.all("/resource", () => {
      handlerCalls++;
      return "all";
    });

    const response = await preflight(app, "/resource", "PROPFIND");
    const methods = methodTokens(response);

    expect(response.status).toBe(204);
    expect(handlerCalls).toBe(0);
    expect(methods).toContain("PROPFIND");
    expect(methods).not.toContain("*");
    expect(varyTokens(response)).toContain("access-control-request-method");
  });

  test("intersects configured methods with actually routable methods", async () => {
    const app = new Gelis();
    app.use(cors({ methods: ["GET", "POST", "PROPFIND"] }));
    app.get("/resource", () => "ok");

    const response = await preflight(app, "/resource", "POST");

    expect(methodTokens(response)).toEqual(["GET"]);
  });

  test("does not advertise fabricated methods for a missing route", async () => {
    const app = new Gelis();
    app.use(cors());
    app.get("/existing", () => "ok");

    const response = await preflight(app, "/missing", "POST");

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBeNull();
  });

  test("rejects invalid requested method and requested-header syntax", async () => {
    const app = new Gelis();
    app.use(cors());
    app.post("/resource", () => "ok");

    const badMethod = await dispatch(app, "/resource", {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "BAD METHOD",
      },
    });
    expect(badMethod.status).toBe(400);

    const badHeaders = await dispatch(app, "/resource", {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "X-Good, bad header",
      },
    });
    expect(badHeaders.status).toBe(400);
  });

  test("reflects normalized requested headers and varies by the request header list", async () => {
    const app = new Gelis();
    app.use(cors());
    app.post("/resource", () => "ok");

    const response = await preflight(app, "/resource", "POST", {
      "Access-Control-Request-Headers": " X-Token, Content-Type, x-token ",
    });

    expect(response.headers.get("access-control-allow-headers")).toBe(
      "x-token, content-type",
    );
    expect(varyTokens(response)).toContain("access-control-request-headers");
  });

  test("emits prevalidated explicit allow headers and max age", async () => {
    const app = new Gelis();
    app.use(
      cors({
        allowHeaders: ["X-Token", "Content-Type"],
        maxAge: 600,
      }),
    );
    app.post("/resource", () => "ok");

    const response = await preflight(app, "/resource", "POST");

    expect(response.headers.get("access-control-allow-headers")).toBe(
      "X-Token, Content-Type",
    );
    expect(response.headers.get("access-control-max-age")).toBe("600");
    expect(varyTokens(response)).not.toContain("access-control-request-headers");
  });
});

describe("P11-D CORS Vary behavior", () => {
  test("preserves existing Vary values and deduplicates Origin", async () => {
    const app = new Gelis();
    app.use(cors({ origin: ORIGIN }));
    app.get(
      "/resource",
      () =>
        new Response("ok", {
          headers: { Vary: "Accept-Encoding, Origin" },
        }),
    );

    const response = await dispatch(app, "/resource", {
      headers: { Origin: ORIGIN },
    });

    expect(varyTokens(response)).toEqual(["accept-encoding", "origin"]);
  });

  test("preserves Vary wildcard", async () => {
    const app = new Gelis();
    app.use(cors({ origin: ORIGIN }));
    app.get(
      "/resource",
      () => new Response("ok", { headers: { Vary: "*" } }),
    );

    const response = await dispatch(app, "/resource", {
      headers: { Origin: ORIGIN },
    });

    expect(response.headers.get("vary")).toBe("*");
  });
});

async function dispatch(
  app: Gelis,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return await app.fetch(new Request(`https://api.example${path}`, init));
}

async function preflight(
  app: Gelis,
  path: string,
  requestedMethod: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return dispatch(app, path, {
    method: "OPTIONS",
    headers: {
      Origin: ORIGIN,
      "Access-Control-Request-Method": requestedMethod,
      ...headers,
    },
  });
}

function methodTokens(response: Response): string[] {
  const value = response.headers.get("access-control-allow-methods");

  return value === null
    ? []
    : value.split(",").map((method) => method.trim()).filter(Boolean);
}

function varyTokens(response: Response): string[] {
  const value = response.headers.get("vary");

  return value === null
    ? []
    : value
        .split(",")
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean);
}

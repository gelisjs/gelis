import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";
import { cors } from "../../src/cors/index";
import { requestId } from "../../src/request-id/index";
import { secureHeaders } from "../../src/secure-headers/index";

const API_URL = "https://api.example";
const ORIGIN = "https://client.example";

describe("P11-G request-ID application integration", () => {
  test("prepares request-local identity before ordinary onRequest and propagates it", async () => {
    const app = new Gelis();
    const ids = requestId({ generator: () => "generated-id" });
    const events: string[] = [];

    app.use(ids);
    app.onRequest(({ request }) => {
      events.push(`onRequest:${ids.get(request) ?? "missing"}`);
    });
    app.get("/resource", ({ request }) => {
      const resolved = ids.get(request);
      events.push(`handler:${resolved ?? "missing"}`);

      return new Response(resolved, {
        headers: {
          "X-Request-Id": "handler-conflict",
        },
      });
    });

    const request = new Request(`${API_URL}/resource`, {
      headers: {
        "X-Request-Id": "untrusted-inbound",
      },
    });
    const response = await app.fetch(request);

    expect(events).toEqual(["onRequest:generated-id", "handler:generated-id"]);
    expect(await response.text()).toBe("generated-id");
    expect(response.headers.get("x-request-id")).toBe("generated-id");
    expect(request.headers.get("x-request-id")).toBe("untrusted-inbound");
  });

  test("propagates request IDs on 404, 405, and automatic OPTIONS responses", async () => {
    const app = new Gelis();
    const ids = requestId({
      generator(request) {
        return `${request.method.toLowerCase()}-id`;
      },
    });

    app.use(ids);
    app.get("/resource", () => "ok");

    const notFound = await app.fetch(new Request(`${API_URL}/missing`));
    const methodNotAllowed = await app.fetch(
      new Request(`${API_URL}/resource`, { method: "POST" }),
    );
    const options = await app.fetch(
      new Request(`${API_URL}/resource`, { method: "OPTIONS" }),
    );

    expect(notFound.status).toBe(404);
    expect(notFound.headers.get("x-request-id")).toBe("get-id");

    expect(methodNotAllowed.status).toBe(405);
    expect(methodNotAllowed.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(methodNotAllowed.headers.get("x-request-id")).toBe("post-id");

    expect(options.status).toBe(204);
    expect(options.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(options.headers.get("x-request-id")).toBe("options-id");
  });

  test("propagates on handled onError responses and exposes the same ID to onError", async () => {
    const app = new Gelis();
    const ids = requestId({ generator: () => "error-id" });
    let seen: string | undefined;

    app.use(ids);
    app.onError(({ request }) => {
      seen = ids.get(request);
      return new Response("handled", {
        status: 599,
        headers: {
          "X-Request-Id": "error-conflict",
        },
      });
    });
    app.get("/boom", () => {
      throw new Error("boom");
    });

    const response = await app.fetch(new Request(`${API_URL}/boom`));

    expect(response.status).toBe(599);
    expect(await response.text()).toBe("handled");
    expect(seen).toBe("error-id");
    expect(response.headers.get("x-request-id")).toBe("error-id");
  });

  test("does not retry a failing generator while handling its own preparation error", async () => {
    const app = new Gelis();
    let calls = 0;
    const ids = requestId({
      generator() {
        calls++;
        throw new Error("generator failed");
      },
    });

    app.use(ids);
    app.onError(({ request, error }) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("generator failed");
      expect(ids.get(request)).toBeUndefined();
      return new Response("handled", { status: 598 });
    });
    app.get("/resource", () => "unreachable");

    const response = await app.fetch(new Request(`${API_URL}/resource`));

    expect(calls).toBe(1);
    expect(response.status).toBe(598);
    expect(await response.text()).toBe("handled");
    expect(response.headers.get("x-request-id")).toBeNull();
  });

  test("covers CORS preflight before routing in both plugin registration orders", async () => {
    for (const requestIdFirst of [false, true]) {
      const app = new Gelis();
      const ids = requestId({ generator: () => "preflight-id" });

      if (requestIdFirst) {
        app.use(ids);
        app.use(cors({ origin: ORIGIN }));
      } else {
        app.use(cors({ origin: ORIGIN }));
        app.use(ids);
      }

      app.post("/resource", () => "ok");

      const request = new Request(`${API_URL}/resource`, {
        method: "OPTIONS",
        headers: {
          Origin: ORIGIN,
          "Access-Control-Request-Method": "POST",
        },
      });
      const response = await app.fetch(request);

      expect(response.status).toBe(204);
      expect(ids.get(request)).toBe("preflight-id");
      expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
      expect(response.headers.get("x-request-id")).toBe("preflight-id");
    }
  });

  test("composes after secure headers regardless of plugin registration order", async () => {
    for (const requestIdFirst of [false, true]) {
      const app = new Gelis();
      const ids = requestId({ generator: () => "secure-id" });

      if (requestIdFirst) {
        app.use(ids);
        app.use(secureHeaders());
      } else {
        app.use(secureHeaders());
        app.use(ids);
      }

      app.get(
        "/resource",
        () =>
          new Response("ok", {
            headers: {
              "X-Request-Id": "handler-conflict",
              "X-Powered-By": "handler",
            },
          }),
      );

      const response = await app.fetch(new Request(`${API_URL}/resource`));

      expect(response.headers.get("x-request-id")).toBe("secure-id");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-powered-by")).toBeNull();
    }
  });

  test("reconstructs responses when direct header mutation is rejected", async () => {
    const guarded = new Response("payload", {
      status: 201,
      statusText: "Created By Handler",
      headers: { "X-Unrelated": "preserved" },
    });

    Object.defineProperty(guarded.headers, "set", {
      configurable: true,
      value() {
        throw new TypeError("immutable headers");
      },
    });

    const app = new Gelis();
    app.use(requestId({ generator: () => "reconstructed-id" }));
    app.get("/resource", () => guarded);

    const response = await app.fetch(new Request(`${API_URL}/resource`));

    expect(response).not.toBe(guarded);
    expect(response.status).toBe(201);
    expect(response.statusText).toBe("Created By Handler");
    expect(await response.text()).toBe("payload");
    expect(response.headers.get("x-unrelated")).toBe("preserved");
    expect(response.headers.get("x-request-id")).toBe("reconstructed-id");
  });

  test("rejects duplicate request-ID policy transactionally", async () => {
    const app = new Gelis();
    const first = requestId({ generator: () => "first-id" });

    app.use(first);
    expect(() =>
      app.use(requestId({ generator: () => "second-id" })),
    ).toThrow();

    app.get("/resource", ({ request }) => first.get(request) ?? "missing");

    const response = await app.fetch(new Request(`${API_URL}/resource`));

    expect(await response.text()).toBe("first-id");
    expect(response.headers.get("x-request-id")).toBe("first-id");
  });
});

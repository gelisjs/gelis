import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";
import { requestId } from "../../src/request-id/index";
import { secureHeaders } from "../../src/secure-headers/index";

describe("P11-G request ID application policy integration", () => {
  test("exposes one resolved ID to the handler and final response", async () => {
    const app = new Gelis();
    const ids = requestId({ generator: () => "generated-42" });

    app.use(ids);
    app.get("/resource", ({ request }) => {
      expect(ids.get(request)).toBe("generated-42");
      return new Response("ok");
    });

    const response = await app.fetch(
      new Request("https://api.example/resource"),
    );

    expect(response.headers.get("x-request-id")).toBe("generated-42");
  });

  test("ignores caller-controlled IDs by default and propagates the generated ID", async () => {
    const app = new Gelis();
    const ids = requestId({ generator: () => "framework-owned" });

    app.use(ids);
    app.get("/resource", ({ request }) => ids.get(request) ?? "missing");

    const response = await app.fetch(
      new Request("https://api.example/resource", {
        headers: { "X-Request-Id": "caller-controlled" },
      }),
    );

    expect(await response.text()).toBe("framework-owned");
    expect(response.headers.get("x-request-id")).toBe("framework-owned");
  });

  test("adopts a trusted valid inbound ID when explicitly enabled", async () => {
    const app = new Gelis();
    const ids = requestId({
      acceptIncoming: true,
      generator: () => "fallback",
    });

    app.use(ids);
    app.get("/resource", ({ request }) => ids.get(request) ?? "missing");

    const response = await app.fetch(
      new Request("https://api.example/resource", {
        headers: { "X-Request-Id": "edge-42" },
      }),
    );

    expect(await response.text()).toBe("edge-42");
    expect(response.headers.get("x-request-id")).toBe("edge-42");
  });

  test("overwrites a conflicting handler response field", async () => {
    const app = new Gelis();
    const ids = requestId({ generator: () => "resolved-id" });

    app.use(ids);
    app.get(
      "/resource",
      () =>
        new Response("ok", {
          headers: { "X-Request-Id": "handler-value" },
        }),
    );

    const response = await app.fetch(
      new Request("https://api.example/resource"),
    );

    expect(response.headers.get("x-request-id")).toBe("resolved-id");
  });

  test("supports a custom request ID response header", async () => {
    const app = new Gelis();
    const ids = requestId({
      header: "X-Correlation-Id",
      generator: () => "correlation-42",
    });

    app.use(ids);
    app.get("/resource", () => "ok");

    const response = await app.fetch(
      new Request("https://api.example/resource"),
    );

    expect(ids.header).toBe("X-Correlation-Id");
    expect(response.headers.get("x-correlation-id")).toBe("correlation-42");
    expect(response.headers.get("x-request-id")).toBeNull();
  });

  test("rebuilds an immutable response only when header mutation is rejected", async () => {
    const app = new Gelis();
    const ids = requestId({ generator: () => "redirect-id" });

    app.use(ids);
    app.get("/redirect", () => Response.redirect("https://example.com/next"));

    const response = await app.fetch(
      new Request("https://api.example/redirect"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/next");
    expect(response.headers.get("x-request-id")).toBe("redirect-id");
  });

  test("propagates an already resolved ID onto a handled onError response", async () => {
    const app = new Gelis();
    const ids = requestId({ generator: () => "error-id" });
    const failure = new Error("handler failed");

    app.use(ids);
    app.onError(({ error, request }) => {
      expect(error).toBe(failure);
      expect(ids.get(request)).toBe("error-id");
      return new Response("handled", { status: 500 });
    });
    app.get("/error", () => {
      throw failure;
    });

    const response = await app.fetch(new Request("https://api.example/error"));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("handled");
    expect(response.headers.get("x-request-id")).toBe("error-id");
  });

  test("routes request ID preparation failures through onError without inventing an ID", async () => {
    const app = new Gelis();
    const failure = new Error("generator failed");
    const ids = requestId({
      generator() {
        throw failure;
      },
    });

    app.use(ids);
    app.onError(({ error, request }) => {
      expect(error).toBe(failure);
      expect(ids.get(request)).toBeUndefined();
      return new Response("handled", { status: 500 });
    });
    app.get("/resource", () => "must not run");

    const response = await app.fetch(
      new Request("https://api.example/resource"),
    );

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("handled");
    expect(response.headers.get("x-request-id")).toBeNull();
  });

  test("rejects duplicate request ID application policies transactionally", async () => {
    const app = new Gelis();
    const first = requestId({ generator: () => "first-id" });

    app.use(first);
    expect(() =>
      app.use(requestId({ generator: () => "second-id" })),
    ).toThrow();

    app.get("/resource", () => "ok");
    const response = await app.fetch(
      new Request("https://api.example/resource"),
    );

    expect(response.headers.get("x-request-id")).toBe("first-id");
  });

  test("composes with secure headers regardless of plugin registration order", async () => {
    for (const requestIdFirst of [false, true]) {
      const app = new Gelis();
      const ids = requestId({ generator: () => "composed-id" });

      if (requestIdFirst) {
        app.use(ids);
        app.use(secureHeaders());
      } else {
        app.use(secureHeaders());
        app.use(ids);
      }

      app.get("/resource", () => "ok");

      const response = await app.fetch(
        new Request("https://api.example/resource"),
      );

      expect(response.headers.get("x-request-id")).toBe("composed-id");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("strict-transport-security")).toBe(
        "max-age=31536000",
      );
    }
  });
});

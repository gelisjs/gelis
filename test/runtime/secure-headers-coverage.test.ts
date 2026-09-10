import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";
import { cors } from "../../src/cors/index";
import { secureHeaders } from "../../src/secure-headers/index";

const API_URL = "https://api.example";
const ORIGIN = "https://client.example";

function expectDefaultSecurityHeaders(response: Response): void {
  expect(response.headers.get("strict-transport-security")).toBe(
    "max-age=31536000",
  );
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  expect(response.headers.get("x-xss-protection")).toBe("0");
}

describe("P11-F secure-header response coverage", () => {
  test("covers 404 and 405 responses without disturbing Allow", async () => {
    const app = new Gelis();
    app.use(secureHeaders());
    app.get("/resource", () => "ok");

    const notFound = await app.fetch(new Request(`${API_URL}/missing`));
    const methodNotAllowed = await app.fetch(
      new Request(`${API_URL}/resource`, { method: "POST" }),
    );

    expect(notFound.status).toBe(404);
    expectDefaultSecurityHeaders(notFound);

    expect(methodNotAllowed.status).toBe(405);
    expect(methodNotAllowed.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expectDefaultSecurityHeaders(methodNotAllowed);
  });

  test("covers implicit HEAD and automatic OPTIONS responses", async () => {
    const app = new Gelis();
    app.use(secureHeaders());
    app.get("/resource", () => "payload");

    const head = await app.fetch(
      new Request(`${API_URL}/resource`, { method: "HEAD" }),
    );
    const options = await app.fetch(
      new Request(`${API_URL}/resource`, { method: "OPTIONS" }),
    );

    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expectDefaultSecurityHeaders(head);

    expect(options.status).toBe(204);
    expect(options.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expectDefaultSecurityHeaders(options);
  });

  test("covers handled onError responses", async () => {
    const app = new Gelis();
    app.use(secureHeaders());
    app.onError(
      () =>
        new Response("handled", {
          status: 599,
          statusText: "Handled",
        }),
    );
    app.get("/boom", () => {
      throw new Error("boom");
    });

    const response = await app.fetch(new Request(`${API_URL}/boom`));

    expect(response.status).toBe(599);
    expect(response.statusText).toBe("Handled");
    expect(await response.text()).toBe("handled");
    expectDefaultSecurityHeaders(response);
  });

  test("covers CORS preflight responses in both plugin orders", async () => {
    for (const secureFirst of [false, true]) {
      const app = new Gelis();

      if (secureFirst) {
        app.use(secureHeaders());
        app.use(cors({ origin: ORIGIN }));
      } else {
        app.use(cors({ origin: ORIGIN }));
        app.use(secureHeaders());
      }

      app.post("/resource", () => "ok");

      const response = await app.fetch(
        new Request(`${API_URL}/resource`, {
          method: "OPTIONS",
          headers: {
            Origin: ORIGIN,
            "Access-Control-Request-Method": "POST",
          },
        }),
      );

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
      expectDefaultSecurityHeaders(response);
    }
  });

  test("preserves disabled managed fields supplied by the handler", async () => {
    const app = new Gelis();
    app.use(
      secureHeaders({
        strictTransportSecurity: false,
        xContentTypeOptions: false,
        referrerPolicy: false,
        xFrameOptions: false,
        xXssProtection: false,
        removePoweredBy: false,
      }),
    );
    app.get(
      "/resource",
      () =>
        new Response("ok", {
          headers: {
            "Strict-Transport-Security": "max-age=10",
            "X-Content-Type-Options": "custom",
            "Referrer-Policy": "unsafe-url",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1",
            "X-Powered-By": "handler",
          },
        }),
    );

    const response = await app.fetch(new Request(`${API_URL}/resource`));

    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=10",
    );
    expect(response.headers.get("x-content-type-options")).toBe("custom");
    expect(response.headers.get("referrer-policy")).toBe("unsafe-url");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-xss-protection")).toBe("1");
    expect(response.headers.get("x-powered-by")).toBe("handler");
  });

  test("applies opt-in CSP and isolation fields", async () => {
    const app = new Gelis();
    app.use(
      secureHeaders({
        contentSecurityPolicy: "default-src 'self'",
        contentSecurityPolicyReportOnly: "default-src 'none'",
        crossOriginEmbedderPolicy: "credentialless",
        crossOriginOpenerPolicy: "same-origin",
        crossOriginResourcePolicy: "same-site",
        originAgentCluster: true,
        permissionsPolicy: "camera=(), microphone=()",
      }),
    );
    app.get("/resource", () => "ok");

    const response = await app.fetch(new Request(`${API_URL}/resource`));

    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'self'",
    );
    expect(response.headers.get("content-security-policy-report-only")).toBe(
      "default-src 'none'",
    );
    expect(response.headers.get("cross-origin-embedder-policy")).toBe(
      "credentialless",
    );
    expect(response.headers.get("cross-origin-opener-policy")).toBe(
      "same-origin",
    );
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-site",
    );
    expect(response.headers.get("origin-agent-cluster")).toBe("?1");
    expect(response.headers.get("permissions-policy")).toBe(
      "camera=(), microphone=()",
    );
  });

  test("preserves status, statusText, body, and unrelated headers", async () => {
    const app = new Gelis();
    app.use(secureHeaders());
    app.get(
      "/resource",
      () =>
        new Response("payload", {
          status: 201,
          statusText: "Custom Created",
          headers: { "X-Unrelated": "preserved" },
        }),
    );

    const response = await app.fetch(new Request(`${API_URL}/resource`));

    expect(response.status).toBe(201);
    expect(response.statusText).toBe("Custom Created");
    expect(await response.text()).toBe("payload");
    expect(response.headers.get("x-unrelated")).toBe("preserved");
    expectDefaultSecurityHeaders(response);
  });

  test("reconstructs responses when header mutation is rejected", async () => {
    const guarded = new Response(null, {
      status: 307,
      headers: { Location: "https://target.example/" },
    });

    Object.defineProperty(guarded.headers, "set", {
      configurable: true,
      value() {
        throw new TypeError("immutable headers");
      },
    });

    expect(() => guarded.headers.set("X-Test", "blocked")).toThrow();

    const app = new Gelis();
    app.use(secureHeaders());
    app.get("/resource", () => guarded);

    const response = await app.fetch(new Request(`${API_URL}/resource`));

    expect(response).not.toBe(guarded);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://target.example/");
    expectDefaultSecurityHeaders(response);
  });

  test("finalizes ordinary onRequest early responses", async () => {
    const app = new Gelis();
    app.use(secureHeaders());
    app.onRequest(
      () =>
        new Response("early", {
          status: 202,
          headers: { "X-Powered-By": "early-hook" },
        }),
    );
    app.get("/resource", () => "handler");

    const response = await app.fetch(new Request(`${API_URL}/resource`));

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("early");
    expect(response.headers.get("x-powered-by")).toBeNull();
    expectDefaultSecurityHeaders(response);
  });
});

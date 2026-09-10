import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";
import { cors } from "../../src/cors/index";
import { secureHeaders } from "../../src/secure-headers/index";

const ORIGIN = "https://client.example";

describe("P11-F secure-header application policy integration", () => {
  test("applies the frozen default policy to normal responses", async () => {
    const app = new Gelis();
    app.use(secureHeaders());
    app.get("/resource", () => "ok");

    const response = await app.fetch(
      new Request("https://api.example/resource"),
    );

    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=31536000",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("x-xss-protection")).toBe("0");
  });

  test("overwrites managed fields and removes X-Powered-By", async () => {
    const app = new Gelis();
    app.use(secureHeaders());
    app.get(
      "/resource",
      () =>
        new Response("ok", {
          headers: {
            "Referrer-Policy": "unsafe-url",
            "X-Powered-By": "example",
            "X-Unrelated": "preserved",
          },
        }),
    );

    const response = await app.fetch(
      new Request("https://api.example/resource"),
    );

    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-powered-by")).toBeNull();
    expect(response.headers.get("x-unrelated")).toBe("preserved");
  });

  test("rejects duplicate secure-header policy transactionally", async () => {
    const app = new Gelis();
    app.use(secureHeaders());

    expect(() => app.use(secureHeaders())).toThrow();

    app.get("/resource", () => "ok");
    const response = await app.fetch(
      new Request("https://api.example/resource"),
    );

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("composes after CORS regardless of plugin registration order", async () => {
    for (const secureFirst of [false, true]) {
      const app = new Gelis();

      if (secureFirst) {
        app.use(secureHeaders());
        app.use(cors({ origin: ORIGIN }));
      } else {
        app.use(cors({ origin: ORIGIN }));
        app.use(secureHeaders());
      }

      app.get("/resource", () => "ok");

      const response = await app.fetch(
        new Request("https://api.example/resource", {
          headers: { Origin: ORIGIN },
        }),
      );

      expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("strict-transport-security")).toBe(
        "max-age=31536000",
      );
    }
  });
});

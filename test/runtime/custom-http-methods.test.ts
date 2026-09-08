import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "../../src";

describe("custom HTTP methods", () => {
  test("routes a supported custom wire method and preserves its identity", async () => {
    const app = new Gelis();

    app.route("PURGE", "/cache", ({ request }) => request.method);

    const response = await app.fetch(
      new Request("http://gelis.test/cache", {
        method: "PURGE",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("PURGE");

    expect(inspectContract(app).routes[0]?.method).toBe("PURGE");
  });

  test("preserves arbitrary valid custom method casing at registration", () => {
    const app = new Gelis();

    app.route("MiXeD-Gelis", "/mixed", () => "ok");

    expect(inspectContract(app).routes[0]?.method).toBe("MiXeD-Gelis");
  });

  test("keeps ALL available as an ordinary wire token", () => {
    const app = new Gelis();

    app.route("ALL", "/wire-all", () => "ok");

    expect(inspectContract(app).routes[0]?.method).toBe("ALL");
  });

  test("rejects the reserved all-route marker at runtime", () => {
    const app = new Gelis();

    const method: string = "*";

    expect(() => app.route(method, "/reserved", () => "no")).toThrow(
      'HTTP method "*" is reserved for Gelis all-route matching',
    );
  });

  test("rejects invalid HTTP method tokens at runtime", () => {
    const app = new Gelis();

    const method: string = "BAD METHOD";

    expect(() => app.route(method, "/invalid", () => "no")).toThrow(
      "Invalid HTTP method token",
    );
  });

  test("rejects Fetch-forbidden methods case-insensitively", () => {
    for (const method of ["CONNECT", "trace", "TrAcK"]) {
      const app = new Gelis();

      expect(() => app.route(method, "/forbidden", () => "no")).toThrow(
        "Forbidden Fetch HTTP method",
      );
    }
  });

  test("rejects non-canonical Fetch-normalized methods", () => {
    for (const method of ["get", "PoSt", "options"]) {
      const app = new Gelis();

      expect(() => app.route(method, "/normalized", () => "no")).toThrow(
        "Non-canonical Fetch-normalized HTTP method",
      );
    }
  });
});

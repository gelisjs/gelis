import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";
import { cors } from "../../src/cors/index";

describe("P11-D CORS configuration validation", () => {
  test("rejects malformed configured origins and wildcard origin arrays", () => {
    expect(() => cors({ origin: "https://client.example/path" })).toThrow(
      TypeError,
    );

    expect(() => cors({ origin: ["https://client.example", "*"] })).toThrow(
      TypeError,
    );
  });

  test("rejects invalid configured methods and header field names", () => {
    expect(() => cors({ methods: ["BAD METHOD"] })).toThrow(TypeError);
    expect(() => cors({ methods: ["*"] })).toThrow(TypeError);
    expect(() => cors({ allowHeaders: ["Bad Header"] })).toThrow(TypeError);
    expect(() => cors({ exposeHeaders: ["Bad Header"] })).toThrow(TypeError);
  });
});

describe("P11-D CORS strict preflight syntax", () => {
  test("rejects malformed requested headers even with explicit allowHeaders", async () => {
    const app = new Gelis();

    app.use(
      cors({
        allowHeaders: ["Authorization"],
      }),
    );
    app.post("/resource", () => "ok");

    const response = await app.fetch(
      new Request("https://api.example/resource", {
        method: "OPTIONS",
        headers: {
          Origin: "https://client.example",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Authorization, bad header",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

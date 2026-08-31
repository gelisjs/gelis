import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import { serve } from "../../prototype/bun";

describe("Gelis Bun adapter", () => {
  test("serves Gelis routes through Bun.serve", async () => {
    const app = new Gelis();

    app.get(
      "/health",

      () => ({
        status: "ok",
      }),
    );

    const server = serve(app, {
      hostname: "127.0.0.1",

      port: 0,
    });

    try {
      const response = await fetch(new URL("/health", server.url));

      expect(response.status).toBe(200);

      expect(await response.json()).toEqual({
        status: "ok",
      });
    } finally {
      await server.stop(true);
    }
  });

  test("serves dynamic params", async () => {
    const app = new Gelis();

    app.get(
      "/users/:id",

      ({ params }) => ({
        id: params.id,
      }),
    );

    const server = serve(app, {
      hostname: "127.0.0.1",

      port: 0,
    });

    try {
      const response = await fetch(new URL("/users/123", server.url));

      expect(await response.json()).toEqual({
        id: "123",
      });
    } finally {
      await server.stop(true);
    }
  });

  test("forwards Bun server options", async () => {
    const app = new Gelis();

    app.get("/", () => "ok");

    const server = serve(app, {
      hostname: "127.0.0.1",

      port: 0,

      development: false,

      reusePort: false,

      idleTimeout: 15,

      maxRequestBodySize: 1024 * 1024,
    });

    try {
      expect(server.hostname).toBe("127.0.0.1");

      expect(server.port).toBeGreaterThan(0);

      const response = await fetch(server.url);

      expect(await response.text()).toBe("ok");
    } finally {
      await server.stop(true);
    }
  });
});

import { describe, expect, test } from "bun:test";

import { Gelis } from "gelis";
import { serve, serveReady } from "gelis/bun";
import { bodyLimit } from "gelis/body-limit";
import { generateCookie, getCookie, setCookie } from "gelis/cookie";
import { cors } from "gelis/cors";
import { requestId } from "gelis/request-id";
import { secureHeaders } from "gelis/secure-headers";
import { TimeoutError, timeout } from "gelis/timeout";

describe("Gelis package exports", () => {
  test("resolves the portable root export", () => {
    expect(typeof Gelis).toBe("function");

    const app = new Gelis();

    app.get("/", () => "ok");

    expect(app).toBeInstanceOf(Gelis);
  });

  test("resolves the Bun runtime subpath", () => {
    expect(typeof serve).toBe("function");
    expect(typeof serveReady).toBe("function");
  });

  test("resolves the portable cookie subpath", () => {
    expect(typeof getCookie).toBe("function");
    expect(typeof generateCookie).toBe("function");
    expect(typeof setCookie).toBe("function");

    expect(generateCookie("theme", "dark")).toBe("theme=dark; Path=/");
  });

  test("resolves the portable CORS subpath", () => {
    expect(typeof cors).toBe("function");

    const app = new Gelis();
    app.use(cors());
    app.get("/", () => "ok");

    expect(app).toBeInstanceOf(Gelis);
  });

  test("resolves the portable body-limit subpath", () => {
    expect(typeof bodyLimit).toBe("function");

    const app = new Gelis();
    const limit = bodyLimit({ maxBytes: 1024 });

    app.use(limit);
    app.post("/", () => "ok");

    expect(limit.maxBytes).toBe(1024);
    expect(typeof limit.readBody).toBe("function");
    expect(app).toBeInstanceOf(Gelis);
  });

  test("resolves the portable secure-headers subpath", () => {
    expect(typeof secureHeaders).toBe("function");

    const app = new Gelis();
    app.use(secureHeaders());
    app.get("/", () => "ok");

    expect(app).toBeInstanceOf(Gelis);
  });

  test("resolves the portable request-id subpath", () => {
    expect(typeof requestId).toBe("function");

    const app = new Gelis();
    const ids = requestId({ generator: () => "package-request-id" });

    app.use(ids);
    app.get("/", () => "ok");

    expect(app).toBeInstanceOf(Gelis);
  });

  test("resolves the portable timeout subpath", () => {
    expect(typeof timeout).toBe("function");
    expect(typeof TimeoutError).toBe("function");

    const app = new Gelis();
    app.use(timeout({ duration: 1_000 }));
    app.get("/", { timeout: 500 }, () => "ok");

    const error = new TimeoutError(500, "route");
    expect(error.code).toBe("REQUEST_TIMEOUT");
    expect(error.scope).toBe("route");
    expect(app).toBeInstanceOf(Gelis);
  });

  test("does not expose Bun adapter APIs from the portable root", async () => {
    const root = await import("gelis");

    expect("serve" in root).toBe(false);
    expect("serveReady" in root).toBe(false);
  });

  test("does not re-export cookie helpers from the portable root", async () => {
    const root = await import("gelis");

    expect("getCookie" in root).toBe(false);
    expect("generateCookie" in root).toBe(false);
    expect("setCookie" in root).toBe(false);
  });

  test("does not re-export CORS helpers from the portable root", async () => {
    const root = await import("gelis");

    expect("cors" in root).toBe(false);
  });

  test("does not re-export body-limit helpers from the portable root", async () => {
    const root = await import("gelis");

    expect("bodyLimit" in root).toBe(false);
  });

  test("does not re-export secure-header helpers from the portable root", async () => {
    const root = await import("gelis");

    expect("secureHeaders" in root).toBe(false);
  });

  test("does not re-export request-ID or timeout convenience APIs from the portable root", async () => {
    const root = await import("gelis");

    expect("requestId" in root).toBe(false);
    expect("timeout" in root).toBe(false);
    expect("TimeoutError" in root).toBe(false);
  });
});

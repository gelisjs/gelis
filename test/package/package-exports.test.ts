import { describe, expect, test } from "bun:test";

import { Gelis } from "gelis";
import { serve, serveReady } from "gelis/bun";
import { bodyLimit } from "gelis/body-limit";
import { generateCookie, getCookie, setCookie } from "gelis/cookie";
import { cors } from "gelis/cors";

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
});

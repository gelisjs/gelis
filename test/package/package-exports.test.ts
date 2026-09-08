import { describe, expect, test } from "bun:test";

import { Gelis } from "gelis";
import { serve, serveReady } from "gelis/bun";

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

  test("does not expose Bun adapter APIs from the portable root", async () => {
    const root = await import("gelis");

    expect("serve" in root).toBe(false);
    expect("serveReady" in root).toBe(false);
  });
});

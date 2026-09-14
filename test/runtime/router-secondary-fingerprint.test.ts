import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

describe("secondary trailing fingerprint routing", () => {
  test("resolves primary fingerprint collisions without changing route identity", async () => {
    const app = new Gelis();

    for (let index = 0; index < 128; index++) {
      const id = String(index).padStart(4, "0");
      app.get(
        `/collision/${id}aaaa/:value`,
        ({ params }) => `${id}:${params.value}`,
      );
    }

    for (const index of [0, 63, 127]) {
      const id = String(index).padStart(4, "0");
      const response = await app.fetch(
        new Request(
          `http://gelis.test/collision/${id}aaaa/value-${index}?source=test`,
        ),
      );

      expect(await response.text()).toBe(`${id}:value-${index}`);
    }

    const missing = await app.fetch(
      new Request("http://gelis.test/collision/9999aaaa/missing"),
    );

    expect(missing.status).toBe(404);
  });

  test("falls back to exact prefixes when the secondary fingerprint also collides", async () => {
    const app = new Gelis();

    app.get("/secondary/Axxxxxxxx/:id", ({ params }) => `A:${params.id}`);
    app.get("/secondary/Bxxxxxxxx/:id", ({ params }) => `B:${params.id}`);

    const a = await app.fetch(
      new Request("http://gelis.test/secondary/Axxxxxxxx/42"),
    );
    const b = await app.fetch(
      new Request("http://gelis.test/secondary/Bxxxxxxxx/42"),
    );

    expect(await a.text()).toBe("A:42");
    expect(await b.text()).toBe("B:42");
  });
});

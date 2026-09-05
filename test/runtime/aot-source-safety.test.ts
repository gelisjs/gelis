import { describe, expect, test } from "bun:test";

import { analyzeAotSourceSafety } from "../../src/tooling/aot-source-safety";

describe("Gelis AOT source semantic safety", () => {
  test("allows a canonical route-only application", () => {
    const source = `
          const app = new Gelis();

          app.get(
            "/first",
            () => "first",
          );

          app.post(
            "/second",
            () => "second",
          );
        `;

    const safety = analyzeAotSourceSafety(source);

    expect(safety.analysis.routes.length).toBe(2);

    expect(safety.installBeforeOffset).toBe(source.length);
  });

  test("allows onRequest and onError before route completion", () => {
    const source = `
          const app = new Gelis();

          app.onRequest(
            () => undefined,
          );

          app.get(
            "/first",
            () => "first",
          );

          app.onError(
            () => undefined,
          );

          app.get(
            "/second",
            () => "second",
          );
        `;

    const safety = analyzeAotSourceSafety(source);

    expect(safety.analysis.routes.length).toBe(2);

    expect(safety.installBeforeOffset).toBe(source.length);
  });

  test("rejects global before lifecycle before final route", () => {
    expect(() =>
      analyzeAotSourceSafety(`
              const app = new Gelis();

              app.get(
                "/first",
                () => "first",
              );

              app.onBeforeHandle(
                () => undefined,
              );

              app.get(
                "/second",
                () => "second",
              );
            `),
    ).toThrow("app.onBeforeHandle before final AOT route is not supported");
  });

  test("rejects global after lifecycle before final route", () => {
    expect(() =>
      analyzeAotSourceSafety(`
              const app = new Gelis();

              app.onAfterHandle(
                () => undefined,
              );

              app.get(
                "/route",
                () => "ok",
              );
            `),
    ).toThrow("app.onAfterHandle before final AOT route is not supported");
  });

  test("rejects module mounting before final route", () => {
    expect(() =>
      analyzeAotSourceSafety(`
              const app = new Gelis();

              app.mount(module);

              app.get(
                "/route",
                () => "ok",
              );
            `),
    ).toThrow("app.mount before final AOT route is not supported");
  });

  test("rejects application escape before final route", () => {
    expect(() =>
      analyzeAotSourceSafety(`
              const app = new Gelis();

              const alias = app;

              app.get(
                "/route",
                () => "ok",
              );
            `),
    ).toThrow("app reference before final AOT route is not supported");
  });

  test("rejects handlers that capture the application", () => {
    expect(() =>
      analyzeAotSourceSafety(`
              const app = new Gelis();

              app.get(
                "/first",
                () => app.fetch(
                  new Request(
                    "http://gelis.test/other",
                  ),
                ),
              );

              app.get(
                "/second",
                () => "second",
              );
            `),
    ).toThrow("app.fetch before final AOT route is not supported");
  });

  test("places installation before first post-route application use", () => {
    const source = `
          const app = new Gelis();

          app.get(
            "/first",
            () => "first",
          );

          app.get(
            "/second",
            () => "second",
          );

          sideEffect();

          app.onBeforeHandle(
            () => undefined,
          );

          const alias = app;
        `;

    const safety = analyzeAotSourceSafety(source);

    const expected = source.indexOf("app.onBeforeHandle");

    expect(safety.installBeforeOffset).toBe(expected);

    expect(source.slice(safety.installBeforeOffset)).toStartWith(
      "app.onBeforeHandle",
    );
  });

  test("requires no installation for a zero-route application", () => {
    const safety = analyzeAotSourceSafety(`
            const app = new Gelis();

            app.onRequest(
              () => undefined,
            );
          `);

    expect(safety.analysis.routes.length).toBe(0);

    expect(safety.installBeforeOffset).toBeUndefined();
  });
});

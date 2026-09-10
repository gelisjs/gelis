import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";
import { secureHeaders } from "../../src/secure-headers/index";
import {
  createAotAppSession,
  createAotBuildAppSession,
} from "../../src/tooling/aot-app";
import { compileRouterSnapshot } from "../../src/tooling/router-snapshot-compiler";

const API_URL = "https://api.example";

describe("P11-F secure-header AOT preservation", () => {
  test("keeps secure headers installed before router hydration", async () => {
    const snapshot = buildSnapshot(false);
    const runtime = createAotAppSession();

    runtime.app.use(secureHeaders());
    defineRoutes(runtime.app, "runtime");
    runtime.hydrate(snapshot);

    const response = await runtime.app.fetch(
      new Request(`${API_URL}/users/42`),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("runtime:42");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=31536000",
    );
  });

  test("keeps secure headers installed after router hydration", async () => {
    const snapshot = buildSnapshot(false);
    const runtime = createAotAppSession();

    defineRoutes(runtime.app, "runtime");
    runtime.hydrate(snapshot);
    runtime.app.use(secureHeaders());

    const response = await runtime.app.fetch(new Request(`${API_URL}/users/7`));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("runtime:7");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=31536000",
    );
  });

  test("does not serialize secure-header policy into router artifacts", () => {
    const control = buildSnapshot(false);
    const secured = buildSnapshot(true);

    expect(secured).toEqual(control);
  });
});

function buildSnapshot(withSecureHeaders: boolean) {
  const build = createAotBuildAppSession();

  if (withSecureHeaders) {
    build.app.use(secureHeaders());
  }

  defineRoutes(build.app, "build");

  return compileRouterSnapshot(build.collectRoutes());
}

function defineRoutes(app: Gelis, identity: string): void {
  app.get("/health", () => `${identity}:health`);
  app.get("/users/:id", ({ params }) => `${identity}:${params.id}`);
}

import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "../../src";
import { requestId } from "../../src/request-id/index";
import { timeout, TimeoutError } from "../../src/timeout/index";
import {
  createAotAppSession,
  createAotBuildAppSession,
} from "../../src/tooling/aot-app";
import { compileRouterSnapshot } from "../../src/tooling/router-snapshot-compiler";

const API_URL = "https://api.example";

describe("P11-G request-ID and timeout AOT preservation", () => {
  test("keeps request ID active when installed before router hydration", async () => {
    const snapshot = buildHealthSnapshot();
    const runtime = createAotAppSession();
    const ids = requestId({ generator: () => "aot-before" });

    runtime.app.use(ids);
    defineHealthRoute(runtime.app, "runtime");
    runtime.hydrate(snapshot);

    const response = await runtime.app.fetch(new Request(`${API_URL}/health`));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("aot-before");
  });

  test("keeps request ID active when installed after router hydration", async () => {
    const snapshot = buildHealthSnapshot();
    const runtime = createAotAppSession();

    defineHealthRoute(runtime.app, "runtime");
    runtime.hydrate(snapshot);
    runtime.app.use(requestId({ generator: () => "aot-after" }));

    const response = await runtime.app.fetch(new Request(`${API_URL}/health`));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("aot-after");
  });

  test("keeps application timeout active when installed before hydration", async () => {
    const snapshot = buildSlowSnapshot(false);
    const runtime = createAotAppSession();

    runtime.app.use(timeout({ duration: 5 }));
    defineSlowRoute(runtime.app, false);
    runtime.hydrate(snapshot);

    const response = await runtime.app.fetch(new Request(`${API_URL}/slow`));

    expect(response.status).toBe(504);
  });

  test("keeps application timeout active when installed after hydration", async () => {
    const snapshot = buildSlowSnapshot(false);
    const runtime = createAotAppSession();

    defineSlowRoute(runtime.app, false);
    runtime.hydrate(snapshot);
    runtime.app.use(timeout({ duration: 5 }));

    const response = await runtime.app.fetch(new Request(`${API_URL}/slow`));

    expect(response.status).toBe(504);
  });

  test("preserves and binds route timeout when capability is installed before hydration", async () => {
    const snapshot = buildSlowSnapshot(true);
    const runtime = createAotAppSession();
    const deadlines = timeout();
    let signal: AbortSignal | undefined;

    runtime.app.use(deadlines);
    runtime.app.get("/slow", { timeout: 5 }, ({ request }) => {
      signal = deadlines.signal(request);
      return new Promise<Response>(() => {});
    });
    runtime.hydrate(snapshot);

    const response = await runtime.app.fetch(new Request(`${API_URL}/slow`));

    expect(response.status).toBe(504);
    expect(signal?.reason).toBeInstanceOf(TimeoutError);
    expect((signal?.reason as TimeoutError).scope).toBe("route");
  });

  test("preserves and binds route timeout when capability is installed after hydration", async () => {
    const snapshot = buildSlowSnapshot(true);
    const runtime = createAotAppSession();
    const deadlines = timeout();
    let signal: AbortSignal | undefined;

    runtime.app.get("/slow", { timeout: 5 }, ({ request }) => {
      signal = deadlines.signal(request);
      return new Promise<Response>(() => {});
    });
    runtime.hydrate(snapshot);
    runtime.app.use(deadlines);

    const response = await runtime.app.fetch(new Request(`${API_URL}/slow`));

    expect(response.status).toBe(504);
    expect(signal?.reason).toBeInstanceOf(TimeoutError);
    expect((signal?.reason as TimeoutError).scope).toBe("route");
  });

  test("does not serialize request-ID or timeout execution policy into router artifacts", () => {
    const control = buildSlowSnapshot(false);
    const build = createAotBuildAppSession();

    build.app.use(requestId({ generator: () => "build-id" }));
    build.app.use(timeout({ duration: 1_000 }));
    defineSlowRoute(build.app, true);

    const candidate = compileRouterSnapshot(build.collectRoutes());

    expect(candidate).toEqual(control);
  });

  test("keeps request-ID and timeout execution metadata out of contract snapshots", () => {
    const app = new Gelis();

    app.use(requestId({ generator: () => "contract-id" }));
    app.use(timeout());
    app.get("/timed", { timeout: 250 }, () => "ok");

    const snapshot = inspectContract(app);
    const route = snapshot.routes[0];

    expect(route).toBeDefined();
    expect("timeout" in route!).toBe(false);
    expect("requestId" in route!).toBe(false);
  });
});

function buildHealthSnapshot() {
  const build = createAotBuildAppSession();
  defineHealthRoute(build.app, "build");
  return compileRouterSnapshot(build.collectRoutes());
}

function buildSlowSnapshot(timed: boolean) {
  const build = createAotBuildAppSession();
  defineSlowRoute(build.app, timed);
  return compileRouterSnapshot(build.collectRoutes());
}

function defineHealthRoute(app: Gelis, identity: string): void {
  app.get("/health", () => `${identity}:ok`);
}

function defineSlowRoute(app: Gelis, timed: boolean): void {
  if (timed) {
    app.get("/slow", { timeout: 5 }, () => new Promise<Response>(() => {}));
    return;
  }

  app.get("/slow", () => new Promise<Response>(() => {}));
}

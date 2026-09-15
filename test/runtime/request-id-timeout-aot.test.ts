import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "../../src";
import { requestId } from "../../src/request-id";
import { GelisTimeoutError, timeout } from "../../src/timeout";
import {
  captureFlatAotManagedInput,
  createFlatAotRuntimeAdapter,
} from "../../src/runtime/flat-aot-runtime-adapter";
import { compileFlatAotArtifact } from "../../src/tooling/flat-aot-artifact-compiler";
import {
  createAotAppSession,
  createAotBuildAppSession,
} from "../../src/tooling/aot-app";
import { analyzeAotSource } from "../../src/tooling/aot-source-analyzer";
import { compileAotSource } from "../../src/tooling/aot-source-compiler";
import { compileRouterSnapshot } from "../../src/tooling/router-snapshot-compiler";
import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler";

import type { FlatAotManagedInputBinding } from "../../src/runtime/flat-aot-managed-input";
import type { FlatAotRuntimeInstaller } from "../../src/runtime/flat-aot-runtime-adapter";
import type { RuntimeRouteHandler } from "../../src/runtime/types";
import type { TimeoutCapability } from "../../src/timeout";

const API_URL = "https://api.example";

describe("P11-G8 request-ID and timeout AOT preservation", () => {
  test("keeps request ID active when installed before router hydration", async () => {
    const snapshot = buildHealthSnapshot();
    const runtime = createAotAppSession();
    const ids = requestId({ generator: () => "aot-before" });

    runtime.app.use(ids);
    defineHealthRoute(runtime.app);
    runtime.hydrate(snapshot);

    const response = await runtime.app.fetch(new Request(`${API_URL}/health`));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("aot-before");
  });

  test("keeps request ID active when installed after router hydration", async () => {
    const snapshot = buildHealthSnapshot();
    const runtime = createAotAppSession();

    defineHealthRoute(runtime.app);
    runtime.hydrate(snapshot);
    runtime.app.use(requestId({ generator: () => "aot-after" }));

    const response = await runtime.app.fetch(new Request(`${API_URL}/health`));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("aot-after");
  });

  test("keeps application timeout active when installed before hydration", async () => {
    const snapshot = buildSlowSnapshot();
    const runtime = createAotAppSession();

    runtime.app.use(timeout({ duration: 5 }));
    defineSlowRoute(runtime.app);
    runtime.hydrate(snapshot);

    const response = await runtime.app.fetch(new Request(`${API_URL}/slow`));

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Service Unavailable");
  });

  test("keeps application timeout active when installed after hydration", async () => {
    const snapshot = buildSlowSnapshot();
    const runtime = createAotAppSession();

    defineSlowRoute(runtime.app);
    runtime.hydrate(snapshot);
    runtime.app.use(timeout({ duration: 5 }));

    const response = await runtime.app.fetch(new Request(`${API_URL}/slow`));

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Service Unavailable");
  });

  test("accepts canonical source route timeout and preserves the declaration expression", async () => {
    const source = `
      const deadlines = timeout();
      const app = new Gelis();

      app.get(
        "/slow",
        { timeout: deadlines.route(5) },
        () => new Promise(() => {}),
      );
    `;

    const analysis = analyzeAotSource(source);
    const compilation = await compileAotSource(source);

    expect(analysis.routes).toHaveLength(1);
    expect(analysis.routes[0]?.optionsStart).toBeDefined();
    expect(compilation.routeCount).toBe(1);
    expect(compilation.managedInputBindingsIdentifier).toBe(
      "__gelisAotInputBindings",
    );
    expect(compilation.code).toContain("timeout: deadlines.route(5)");
    expect(compilation.code).not.toContain("app.get(");
  });

  test("rejects route timeout source shapes whose owner or duration cannot be proven", () => {
    const unsupported = [
      `
        const deadlines = timeout();
        const routeDeadline = deadlines.route(5);
        const app = new Gelis();
        app.get("/slow", { timeout: routeDeadline }, () => "never");
      `,
      `
        const deadlines = timeout();
        const duration = 5;
        const app = new Gelis();
        app.get("/slow", { timeout: deadlines.route(duration) }, () => "never");
      `,
      `
        const deadlines = timeout();
        const app = new Gelis();
        app.get("/slow", { timeout: deadlines.route(0) }, () => "never");
      `,
    ];

    for (const source of unsupported) {
      expect(() => analyzeAotSource(source)).toThrow("route timeout AOT");
    }
  });

  test("preserves route-timeout owner identity through flat AOT capture and hydration", async () => {
    const deadlines = timeout();
    const fixture = await createTimedFlatAotFixture(deadlines);
    const app = new Gelis();
    let reason: unknown;

    app.use(deadlines);
    fixture.install(app, fixture.handlers, fixture.bindings);

    const response = await app.fetch(new Request(`${API_URL}/slow`));

    expect(response.status).toBe(503);
    expect(reasonFrom(fixture)).toBeInstanceOf(GelisTimeoutError);
    reason = reasonFrom(fixture);
    expect((reason as GelisTimeoutError).source).toBe("route");
  });

  test("allows the matching timeout capability to install after timed flat AOT hydration", async () => {
    const deadlines = timeout();
    const fixture = await createTimedFlatAotFixture(deadlines);
    const app = new Gelis();

    fixture.install(app, fixture.handlers, fixture.bindings);
    app.use(deadlines);

    const response = await app.fetch(new Request(`${API_URL}/slow`));

    expect(response.status).toBe(503);
    expect(reasonFrom(fixture)).toBeInstanceOf(GelisTimeoutError);
  });

  test("rejects a foreign timeout capability after timed flat AOT hydration", async () => {
    const owner = timeout();
    const foreign = timeout();
    const fixture = await createTimedFlatAotFixture(owner);
    const app = new Gelis();

    fixture.install(app, fixture.handlers, fixture.bindings);

    expect(() => app.use(foreign)).toThrow(
      "distinct timeout capability owners",
    );

    app.use(owner);
    const response = await app.fetch(new Request(`${API_URL}/slow`));
    expect(response.status).toBe(503);
  });

  test("keeps request-ID and timeout execution metadata out of router and contract artifacts", () => {
    const build = createAotBuildAppSession();
    const deadlines = timeout();

    build.app.use(requestId({ generator: () => "build-id" }));
    build.app.use(deadlines);
    build.app.get("/timed", { timeout: deadlines.route(250) }, () => "ok");

    const snapshot = compileRouterSnapshot(build.collectRoutes());
    const serialized = JSON.stringify(snapshot);
    const contract = inspectContract(build.app);
    const route = contract.routes[0];

    expect(serialized).not.toContain("request-id");
    expect(serialized).not.toContain("timeout");
    expect(route).toBeDefined();
    expect("timeout" in route!).toBe(false);
    expect("requestId" in route!).toBe(false);
  });
});

interface TimedFlatAotFixture {
  readonly install: FlatAotRuntimeInstaller;
  readonly handlers: readonly RuntimeRouteHandler[];
  readonly bindings: readonly FlatAotManagedInputBinding[];
  readonly reason: () => unknown;
}

async function createTimedFlatAotFixture(
  deadlines: TimeoutCapability,
): Promise<TimedFlatAotFixture> {
  const plan = await compileSemanticRoutePlan([
    {
      method: "GET",
      path: "/slow",
    },
  ]);
  const artifact = compileFlatAotArtifact(plan);
  let observedReason: unknown;
  const binding = captureFlatAotManagedInput(
    {
      timeout: deadlines.route(5),
    },
    async ({ request }) => {
      const signal = deadlines.signal(request)!;

      await new Promise<void>((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            observedReason = signal.reason;
            resolve();
          },
          { once: true },
        );
      });

      return new Response("late");
    },
  );

  return {
    install: createFlatAotRuntimeAdapter(artifact, plan.shapeFingerprint),
    handlers: [() => "unused"],
    bindings: [binding],
    reason: () => observedReason,
  };
}

function reasonFrom(fixture: TimedFlatAotFixture): unknown {
  return fixture.reason();
}

function buildHealthSnapshot() {
  const build = createAotBuildAppSession();
  defineHealthRoute(build.app);
  return compileRouterSnapshot(build.collectRoutes());
}

function buildSlowSnapshot() {
  const build = createAotBuildAppSession();
  defineSlowRoute(build.app);
  return compileRouterSnapshot(build.collectRoutes());
}

function defineHealthRoute(app: Gelis): void {
  app.get("/health", () => "ok");
}

function defineSlowRoute(app: Gelis): void {
  app.get("/slow", () => new Promise<Response>(() => undefined));
}

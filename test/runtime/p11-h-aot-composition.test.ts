import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "../../src";
import { bodyLimit } from "../../src/body-limit/index";
import { cors } from "../../src/cors/index";
import { requestId } from "../../src/request-id/index";
import { secureHeaders } from "../../src/secure-headers/index";
import {
  captureFlatAotManagedInput,
  createFlatAotRuntimeAdapter,
} from "../../src/runtime/flat-aot-runtime-adapter";
import { timeout, TimeoutError } from "../../src/timeout/index";
import {
  createAotAppSession,
  createAotBuildAppSession,
} from "../../src/tooling/aot-app";
import { compileFlatAotArtifact } from "../../src/tooling/flat-aot-artifact-compiler";
import { compileRouterSnapshot } from "../../src/tooling/router-snapshot-compiler";
import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler";

import type { FlatAotManagedInputBinding } from "../../src/runtime/flat-aot-managed-input";
import type { FlatAotRuntimeInstaller } from "../../src/runtime/flat-aot-runtime-adapter";
import type { RuntimeRouteHandler } from "../../src/runtime/types";
import type { StandardSchemaV1 } from "../../src/schema";

const API_URL = "https://api.example";
const ORIGIN = "https://client.example";
const REQUEST_ID = "p11-h-aot-id";

interface ManagedAotFixture {
  readonly install: FlatAotRuntimeInstaller;
  readonly handlers: readonly RuntimeRouteHandler[];
  readonly inputBindings: readonly FlatAotManagedInputBinding[];
}

describe("P11-H cumulative AOT and prebuilt boundaries", () => {
  test("keeps cumulative application policies active when installed before hydration", async () => {
    const snapshot = buildResourceSnapshot();
    const runtime = createAotAppSession();
    const { ids } = installApplicationPolicies(runtime.app, 1_000);

    defineResourceRoutes(runtime.app, "runtime");
    runtime.hydrate(snapshot);

    const request = new Request(`${API_URL}/resource`, {
      headers: { Origin: ORIGIN },
    });
    const response = await runtime.app.fetch(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("runtime:resource");
    expect(ids.get(request)).toBe(REQUEST_ID);
    expectPolicies(response);

    const preflight = await runtime.app.fetch(
      new Request(`${API_URL}/resource`, {
        method: "OPTIONS",
        headers: {
          Origin: ORIGIN,
          "Access-Control-Request-Method": "GET",
        },
      }),
    );

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain(
      "GET",
    );
    expectPolicies(preflight);
  });

  test("keeps cumulative application policies active when installed after hydration", async () => {
    const snapshot = buildResourceSnapshot();
    const runtime = createAotAppSession();

    defineResourceRoutes(runtime.app, "runtime");
    runtime.hydrate(snapshot);
    const { ids } = installApplicationPolicies(runtime.app, 1_000);

    const request = new Request(`${API_URL}/users/42`, {
      headers: { Origin: ORIGIN },
    });
    const response = await runtime.app.fetch(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("runtime:42");
    expect(ids.get(request)).toBe(REQUEST_ID);
    expectPolicies(response);
  });

  test("restores managed body-limit specialization under cumulative policies", async () => {
    const fixture = await createManagedAotFixture(5);
    const app = new Gelis();

    installApplicationPolicies(app, 1_000);
    fixture.install(app, fixture.handlers, fixture.inputBindings);
    app.use(bodyLimit({ maxBytes: 3 }));

    const accepted = await sendText(app, "123");
    const rejected = await sendText(app, "1234");

    expect(accepted.status).toBe(200);
    expect(await accepted.text()).toBe("123");
    expectPolicies(accepted);

    expect(rejected.status).toBe(413);
    expect((await rejected.json()).error.code).toBe("BODY_TOO_LARGE");
    expectPolicies(rejected);
    expect(fixture.inputBindings[0]?.input.bodyLimit).toBe(5);
  });

  test("restores route timeout specialization when timeout is installed after hydration", async () => {
    const snapshot = buildTimedSnapshot();
    const runtime = createAotAppSession();
    const deadlines = timeout();
    const ids = requestId({ generator: () => REQUEST_ID });
    let signal: AbortSignal | undefined;

    runtime.app.get("/slow", { timeout: 5 }, ({ request }) => {
      signal = deadlines.signal(request);
      return new Promise<Response>(() => {});
    });
    runtime.hydrate(snapshot);

    runtime.app.use(cors({ origin: ORIGIN }));
    runtime.app.use(secureHeaders());
    runtime.app.use(ids);
    runtime.app.use(deadlines);

    const request = new Request(`${API_URL}/slow`, {
      headers: { Origin: ORIGIN },
    });
    const response = await runtime.app.fetch(request);

    expect(response.status).toBe(504);
    expect(ids.get(request)).toBe(REQUEST_ID);
    expect(signal?.reason).toBeInstanceOf(TimeoutError);
    expect((signal?.reason as TimeoutError).scope).toBe("route");
    expectPolicies(response);
  });

  test("keeps P11 execution policy out of router artifacts and public contracts", () => {
    const control = buildPolicyIsolationSnapshot(false);
    const candidate = buildPolicyIsolationSnapshot(true);

    expect(candidate).toEqual(control);

    const Body = createTextSchema();
    const app = new Gelis();

    app.use(cors({ origin: ORIGIN }));
    app.use(secureHeaders());
    app.use(requestId({ generator: () => REQUEST_ID }));
    app.use(timeout({ duration: 1_000 }));
    app.use(bodyLimit({ maxBytes: 8 }));
    app.post(
      "/managed",
      {
        body: Body,
        bodyParser: "text",
        bodyLimit: 4,
        timeout: 250,
      },
      ({ body }) => body,
    );

    const contract = inspectContract(app);
    const route = contract.routes[0];

    expect(route).toBeDefined();
    expect("timeout" in route!).toBe(false);
    expect("bodyLimit" in route!).toBe(false);
    expect("requestId" in route!).toBe(false);
    expect("cors" in route!).toBe(false);
    expect("secureHeaders" in route!).toBe(false);
  });
});

function installApplicationPolicies(app: Gelis, duration: number) {
  const ids = requestId({ generator: () => REQUEST_ID });
  const deadlines = timeout({ duration });

  app.use(cors({ origin: ORIGIN }));
  app.use(secureHeaders());
  app.use(ids);
  app.use(deadlines);

  return { ids, deadlines };
}

function expectPolicies(response: Response): void {
  expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
  expect(response.headers.get("strict-transport-security")).toBe(
    "max-age=31536000",
  );
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  expect(response.headers.get("x-xss-protection")).toBe("0");
}

function buildResourceSnapshot() {
  const build = createAotBuildAppSession();
  defineResourceRoutes(build.app, "build");
  return compileRouterSnapshot(build.collectRoutes());
}

function defineResourceRoutes(app: Gelis, identity: string): void {
  app.get("/resource", () => `${identity}:resource`);
  app.get("/users/:id", ({ params }) => `${identity}:${params.id}`);
}

function buildTimedSnapshot() {
  const build = createAotBuildAppSession();

  build.app.get("/slow", { timeout: 5 }, () => new Promise<Response>(() => {}));

  return compileRouterSnapshot(build.collectRoutes());
}

function buildPolicyIsolationSnapshot(withPolicies: boolean) {
  const Body = createTextSchema();
  const build = createAotBuildAppSession();

  if (withPolicies) {
    build.app.use(cors({ origin: ORIGIN }));
    build.app.use(secureHeaders());
    build.app.use(requestId({ generator: () => REQUEST_ID }));
    build.app.use(timeout({ duration: 1_000 }));
    build.app.use(bodyLimit({ maxBytes: 8 }));
  }

  build.app.get("/resource", () => "ok");
  build.app.post(
    "/managed",
    {
      body: Body,
      bodyParser: "text",
      bodyLimit: 4,
      timeout: 250,
    },
    ({ body }) => body,
  );

  return compileRouterSnapshot(build.collectRoutes());
}

async function createManagedAotFixture(
  routeBodyLimit: number,
): Promise<ManagedAotFixture> {
  const plan = await compileSemanticRoutePlan([
    {
      method: "POST",
      path: "/limited",
    },
  ]);
  const artifact = compileFlatAotArtifact(plan);
  const Body = createTextSchema();
  const inputBinding = captureFlatAotManagedInput(
    {
      body: Body,
      bodyParser: "text",
      bodyLimit: routeBodyLimit,
    },
    ({ body }) => body,
  );

  return {
    install: createFlatAotRuntimeAdapter(artifact, plan.shapeFingerprint),
    handlers: [() => "unused"],
    inputBindings: [inputBinding],
  };
}

function createTextSchema(): StandardSchemaV1<unknown, string> {
  return {
    "~standard": {
      version: 1,
      vendor: "gelis-p11-h-aot-test",
      validate(value) {
        if (typeof value !== "string") {
          return {
            issues: [{ message: "Expected string" }],
          };
        }

        return { value };
      },
    },
  };
}

function sendText(app: Gelis, body: string): Promise<Response> | Response {
  return app.fetch(
    new Request(`${API_URL}/limited`, {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        Origin: ORIGIN,
      },
      body,
    }),
  );
}

import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";
import { cors } from "../../src/cors/index";
import { installAotRuntime } from "../../src/runtime/aot-runtime";
import { SEMANTIC_ROUTE_PLAN_VERSION } from "../../src/runtime/semantic-route-plan";
import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler";

const ORIGIN = "https://client.example";

describe("P11-D CORS with hydrated AOT runtime", () => {
  test("keeps route-aware preflight when CORS is installed before hydration", async () => {
    const app = new Gelis();
    app.use(cors());

    await installRoutes(app);

    const response = await preflight(app, "POST");
    const methods = methodTokens(response);

    expect(response.status).toBe(204);
    expect(methods).toContain("GET");
    expect(methods).toContain("HEAD");
    expect(methods).toContain("POST");
    expect(methods).toContain("OPTIONS");
  });

  test("keeps route-aware preflight when CORS is installed after hydration", async () => {
    const app = new Gelis();

    await installRoutes(app);
    app.use(cors());

    const response = await preflight(app, "POST");
    const methods = methodTokens(response);

    expect(response.status).toBe(204);
    expect(methods).toContain("GET");
    expect(methods).toContain("HEAD");
    expect(methods).toContain("POST");
    expect(methods).toContain("OPTIONS");
  });
});

async function installRoutes(app: Gelis): Promise<void> {
  const plan = await compileSemanticRoutePlan([
    { method: "GET", path: "/resource" },
    { method: "POST", path: "/resource" },
  ]);

  installAotRuntime(app, plan, {
    version: SEMANTIC_ROUTE_PLAN_VERSION,
    shapeFingerprint: plan.shapeFingerprint,
    handlers: [() => "get", () => "post"],
  });
}

async function preflight(app: Gelis, method: string): Promise<Response> {
  return await app.fetch(
    new Request("https://api.example/resource", {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": method,
      },
    }),
  );
}

function methodTokens(response: Response): string[] {
  const value = response.headers.get("access-control-allow-methods");

  return value === null
    ? []
    : value.split(",").map((method) => method.trim()).filter(Boolean);
}

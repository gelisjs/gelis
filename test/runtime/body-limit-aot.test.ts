import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";
import { bodyLimit } from "../../src/body-limit/index";

import type { StandardSchemaV1 } from "../../src";

import {
  captureFlatAotManagedInput,
  createFlatAotRuntimeAdapter,
} from "../../src/runtime/flat-aot-runtime-adapter";

import type { FlatAotRuntimeInstaller } from "../../src/runtime/flat-aot-runtime-adapter";
import type { FlatAotManagedInputBinding } from "../../src/runtime/flat-aot-managed-input";
import type { RuntimeRouteHandler } from "../../src/runtime/types";

import { analyzeAotSource } from "../../src/tooling/aot-source-analyzer";
import { compileAotSource } from "../../src/tooling/aot-source-compiler";
import { compileFlatAotArtifact } from "../../src/tooling/flat-aot-artifact-compiler";
import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler";

interface ManagedAotFixture {
  readonly install: FlatAotRuntimeInstaller;
  readonly handlers: readonly RuntimeRouteHandler[];
  readonly inputBindings: readonly FlatAotManagedInputBinding[];
}

describe("Gelis body-limit AOT preservation", () => {
  test("keeps bodyLimit routes eligible for managed source AOT", async () => {
    const source = `
      const Body = schema;
      const app = new Gelis();

      app.post(
        "/limited",
        {
          body: Body,
          bodyParser: "text",
          bodyLimit: 4,
        },
        ({ body }) => body,
      );
    `;

    const analysis = analyzeAotSource(source);

    expect(analysis.routes).toHaveLength(1);
    expect(analysis.routes[0]?.method).toBe("POST");
    expect(analysis.routes[0]?.path).toBe("/limited");
    expect(analysis.routes[0]?.optionsStart).toBeDefined();

    const compilation = await compileAotSource(source);

    expect(compilation.routeCount).toBe(1);
    expect(compilation.managedInputBindingsIdentifier).toBe(
      "__gelisAotInputBindings",
    );
    expect(compilation.code).toContain("bodyLimit: 4");
    expect(compilation.code).toContain("__gI[0] = __gC(");
    expect(compilation.code).not.toContain("app.post(");
  });

  test("still requires bodyLimit AOT metadata to belong to a managed body route", () => {
    expect(() =>
      analyzeAotSource(`
        const app = new Gelis();

        app.post(
          "/invalid",
          {
            bodyLimit: 4,
          },
          () => "never",
        );
      `),
    ).toThrow("managed request-body AOT options require a body property");
  });

  test("captures the original route bodyLimit and enforces it after hydration", async () => {
    const fixture = await createManagedAotFixture(5);
    const binding = fixture.inputBindings[0];

    expect(binding?.input.bodyLimit).toBe(5);

    const app = new Gelis();

    fixture.install(app, fixture.handlers, fixture.inputBindings);

    const equal = await sendText(app, "12345");
    const over = await sendText(app, "123456");

    expect(equal.status).toBe(200);
    expect(await equal.text()).toBe("12345");
    expect(over.status).toBe(413);
  });

  test("specializes hydrated managed routes when the application policy is installed first", async () => {
    const fixture = await createManagedAotFixture(5);
    const app = new Gelis();

    app.use(bodyLimit({ maxBytes: 3 }));
    fixture.install(app, fixture.handlers, fixture.inputBindings);

    const equal = await sendText(app, "123");
    const overApplicationLimit = await sendText(app, "1234");

    expect(equal.status).toBe(200);
    expect(await equal.text()).toBe("123");
    expect(overApplicationLimit.status).toBe(413);
  });

  test("re-specializes existing hydrated managed routes when the application policy is installed later", async () => {
    const fixture = await createManagedAotFixture(5);
    const app = new Gelis();

    fixture.install(app, fixture.handlers, fixture.inputBindings);
    app.use(bodyLimit({ maxBytes: 3 }));

    const equal = await sendText(app, "123");
    const overApplicationLimit = await sendText(app, "1234");

    expect(equal.status).toBe(200);
    expect(await equal.text()).toBe("123");
    expect(overApplicationLimit.status).toBe(413);
  });

  test("keeps the stricter route policy when hydrated under a looser application policy", async () => {
    const fixture = await createManagedAotFixture(3);
    const app = new Gelis();

    app.use(bodyLimit({ maxBytes: 5 }));
    fixture.install(app, fixture.handlers, fixture.inputBindings);

    const equal = await sendText(app, "123");
    const overRouteLimit = await sendText(app, "1234");

    expect(equal.status).toBe(200);
    expect(await equal.text()).toBe("123");
    expect(overRouteLimit.status).toBe(413);
    expect(fixture.inputBindings[0]?.input.bodyLimit).toBe(3);
  });

  test("keeps plain AOT installation free of managed input bindings with bodyLimit enabled", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",
        path: "/plain",
      },
    ]);
    const artifact = compileFlatAotArtifact(plan);
    const install = createFlatAotRuntimeAdapter(
      artifact,
      plan.shapeFingerprint,
    );
    const app = new Gelis();

    app.use(bodyLimit({ maxBytes: 0 }));
    install(app, [() => "plain"]);

    const response = await app.fetch(new Request("http://gelis.test/plain"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("plain");
  });

  test("keeps bodyLimit validation on the canonical managed input compiler", () => {
    const Body = createTextSchema();

    expect(() =>
      captureFlatAotManagedInput(
        {
          body: Body,
          bodyParser: "text",
          bodyLimit: -1,
        },
        ({ body }) => body,
      ),
    ).toThrow(
      "Gelis body limit maxBytes must be a finite safe non-negative integer",
    );
  });
});

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
      vendor: "gelis-test",
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
    new Request("http://gelis.test/limited", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
      },
      body,
    }),
  );
}

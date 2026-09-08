import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";

import { FLAT_AOT_ARTIFACT_VERSION } from "../../src/runtime/flat-aot-artifact";

import { PREORDER_AOT_ARTIFACT_VERSION } from "../../src/runtime/preorder-aot-artifact";

import { installFlatAotRuntime } from "../../src/runtime/flat-aot-runtime";

import { installPreorderAotRuntime } from "../../src/runtime/preorder-aot-runtime";

import { compileFlatAotArtifact } from "../../src/tooling/flat-aot-artifact-compiler";

import { compilePreorderAotArtifact } from "../../src/tooling/preorder-aot-artifact-compiler";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler";

const routeShapes = [
  {
    method: "*",
    path: "/resource/:id",
  },
  {
    method: "PURGE",
    path: "/resource/:id",
  },
] as const;

const handlers = [
  ({ params }: { params: Record<string, string> }) => `all:${params.id}`,
  ({ params }: { params: Record<string, string> }) => `purge:${params.id}`,
] as const;

describe("ALL and custom methods across production AOT runtimes", () => {
  test("flat AOT preserves exact custom-method precedence over ALL", async () => {
    const plan = await compileSemanticRoutePlan(routeShapes);

    const artifact = compileFlatAotArtifact(plan);

    const app = new Gelis();

    installFlatAotRuntime(app, artifact, {
      version: FLAT_AOT_ARTIFACT_VERSION,
      shapeFingerprint: artifact[2],
      handlers,
    });

    const exact = await app.fetch(
      new Request("http://gelis.test/resource/42", {
        method: "PURGE",
      }),
    );

    const fallback = await app.fetch(
      new Request("http://gelis.test/resource/42", {
        method: "POST",
      }),
    );

    expect(await exact.text()).toBe("purge:42");
    expect(await fallback.text()).toBe("all:42");
  });

  test("preorder AOT preserves exact custom-method precedence over ALL", async () => {
    const plan = await compileSemanticRoutePlan(routeShapes);

    const artifact = compilePreorderAotArtifact(plan);

    const app = new Gelis();

    installPreorderAotRuntime(app, artifact, {
      version: PREORDER_AOT_ARTIFACT_VERSION,
      shapeFingerprint: artifact[2],
      handlers,
    });

    const exact = await app.fetch(
      new Request("http://gelis.test/resource/42", {
        method: "PURGE",
      }),
    );

    const fallback = await app.fetch(
      new Request("http://gelis.test/resource/42", {
        method: "POST",
      }),
    );

    expect(await exact.text()).toBe("purge:42");
    expect(await fallback.text()).toBe("all:42");
  });
});

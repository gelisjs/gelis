import { describe, expect, test } from "bun:test";

import { PREORDER_AOT_ARTIFACT_VERSION } from "../../src/runtime/preorder-aot-artifact";

import { compilePreorderAotArtifact } from "../../src/tooling/preorder-aot-artifact-compiler";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler";

describe("Gelis preorder AOT artifact compiler", () => {
  test("serializes static routes deterministically", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/first",
      },

      {
        method: "POST",

        path: "/second",
      },
    ]);

    const artifact = compilePreorderAotArtifact(plan);

    expect(artifact[0]).toBe(PREORDER_AOT_ARTIFACT_VERSION);

    expect(artifact[1]).toBe(2);

    expect(artifact[2]).toBe(plan.shapeFingerprint);

    expect(artifact[3]).toEqual(["GET", "POST"]);

    expect(artifact[4]).toEqual([0, 1]);

    expect(artifact[5]).toEqual(["/first", "/second"]);

    const router = artifact[6];

    expect(router[0]).toEqual([
      [0, ["/first"], [0], 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],

      [1, ["/second"], [1], 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);

    expect(router[1]).toEqual([]);

    expect(router[2]).toEqual([]);

    expect(router[3]).toEqual([]);

    expect(router[4]).toEqual([]);

    expect(router[5]).toEqual([]);

    expect(router[6]).toEqual([]);
  });

  test("preserves trailing-param fast-map topology", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/users/:id",
      },
    ]);

    const artifact = compilePreorderAotArtifact(plan);

    expect(artifact[6][0]).toEqual([
      [0, [], [], ["/users/"], [0], ["id"], 0, 0, 0, 0, 0, 0, 0],
    ]);

    expect(artifact[6][1]).toEqual([]);

    expect(artifact[6][2]).toEqual([]);
  });

  test("serializes generic dynamic trie in preorder", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/users/:id/detail",
      },
    ]);

    const artifact = compilePreorderAotArtifact(plan);

    const router = artifact[6];

    expect(router[0]).toEqual([[0, [], [], 0, 0, 0, 0, 4, 0, 2, 0, 1, 1]]);

    expect(router[1]).toEqual([1, 0, 1, 0]);

    expect(router[2]).toEqual([0, 1, 0, 0]);

    expect(router[3]).toEqual([-1, -1, -1, 0]);

    expect(router[4]).toEqual([0, 0, 0, 1]);

    expect(router[5]).toEqual(["users", "detail"]);

    expect(router[6]).toEqual(["id"]);
  });

  test("preserves multi-parameter preorder semantics", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/teams/:team/users/:id/detail",
      },
    ]);

    const artifact = compilePreorderAotArtifact(plan);

    expect(artifact[6][6]).toEqual(["team", "id"]);

    const method = artifact[6][0][0];

    expect(method?.[12]).toBe(1);

    expect(method?.[11]).toBe(2);
  });

  test("preserves registration order independently of method grouping", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "POST",

        path: "/first",
      },

      {
        method: "GET",

        path: "/second",
      },

      {
        method: "POST",

        path: "/third",
      },
    ]);

    const artifact = compilePreorderAotArtifact(plan);

    expect(artifact[3]).toEqual(["POST", "GET"]);

    expect(artifact[4]).toEqual([0, 1, 0]);

    expect(artifact[5]).toEqual(["/first", "/second", "/third"]);
  });

  test("produces deterministic artifacts", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/a",
      },

      {
        method: "GET",

        path: "/users/:id/detail",
      },

      {
        method: "POST",

        path: "/b",
      },
    ]);

    const first = compilePreorderAotArtifact(plan);

    const second = compilePreorderAotArtifact(plan);

    expect(second).toEqual(first);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  test("survives a JSON round trip", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/static",
      },

      {
        method: "POST",

        path: "/users/:id",
      },

      {
        method: "PATCH",

        path: "/teams/:team/users/:id",
      },
    ]);

    const artifact = compilePreorderAotArtifact(plan);

    const restored = JSON.parse(JSON.stringify(artifact));

    expect(restored).toEqual(artifact);
  });

  test("rejects inconsistent semantic route counts", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/route",
      },
    ]);

    const invalid = {
      ...plan,

      routeCount: 2,
    };

    expect(() => compilePreorderAotArtifact(invalid)).toThrow(
      "Gelis preorder AOT artifact route count mismatch",
    );
  });
});

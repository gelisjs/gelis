import { describe, expect, test } from "bun:test";

import { compileFlatAotArtifact } from "../../src/tooling/flat-aot-artifact-compiler";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler";

import { FLAT_AOT_ARTIFACT_VERSION } from "../../src/runtime/flat-aot-artifact";

describe("Gelis flat AOT artifact compiler", () => {
  test("flattens static routes deterministically", async () => {
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

    const artifact = compileFlatAotArtifact(plan);

    expect(artifact[0]).toBe(FLAT_AOT_ARTIFACT_VERSION);

    expect(artifact[1]).toBe(2);

    expect(artifact[2]).toBe(plan.shapeFingerprint);

    expect(artifact[3]).toEqual(["GET", "POST"]);

    expect(artifact[4]).toEqual([0, 1]);

    expect(artifact[5]).toEqual(["/first", "/second"]);

    const router = artifact[6];

    expect(router[0]).toEqual([
      [0, ["/first"], [0], 0, 0, 0, 0, 0],

      [1, ["/second"], [1], 0, 0, 0, 1, 0],
    ]);

    expect(router[1]).toEqual([0, 0]);

    expect(router[2]).toEqual([0, 0]);

    expect(router[3]).toEqual([-1, -1]);

    expect(router[4]).toEqual([-1, -1]);

    expect(router[7]).toEqual([]);

    expect(router[8]).toEqual([]);

    expect(router[9]).toEqual([]);
  });

  test("preserves trailing-param fast-map topology", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/users/:id",
      },
    ]);

    const artifact = compileFlatAotArtifact(plan);

    expect(artifact[6][0]).toEqual([
      [0, [], [], ["/users/"], [0], ["id"], 0, 0],
    ]);

    expect(artifact[6][3]).toEqual([-1]);

    expect(artifact[6][4]).toEqual([-1]);
  });

  test("flattens generic dynamic trie topology", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/users/:id/detail",
      },
    ]);

    const artifact = compileFlatAotArtifact(plan);

    const router = artifact[6];

    expect(router[0][0]?.[7]).toBe(1);

    expect(router[1]).toEqual([0, 1, 1, 2]);

    expect(router[2]).toEqual([1, 0, 1, 0]);

    expect(router[3]).toEqual([-1, 2, -1, -1]);

    expect(router[4]).toEqual([-1, -1, -1, 0]);

    expect(router[6]).toEqual([0, 0, 0, 1]);

    expect(router[7]).toEqual(["users", "detail"]);

    expect(router[8]).toEqual([1, 3]);

    expect(router[9]).toEqual(["id"]);
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

    const artifact = compileFlatAotArtifact(plan);

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

    const first = compileFlatAotArtifact(plan);

    const second = compileFlatAotArtifact(plan);

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

    const artifact = compileFlatAotArtifact(plan);

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

    expect(() => compileFlatAotArtifact(invalid)).toThrow(
      "Gelis flat AOT artifact route count mismatch",
    );
  });
});

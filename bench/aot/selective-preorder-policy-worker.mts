import { Gelis } from "../../src/app.ts";

import { FLAT_AOT_ARTIFACT_VERSION } from "../../src/runtime/flat-aot-artifact.ts";

import { installFlatAotRuntime } from "../../src/runtime/flat-aot-runtime.ts";

import { PREORDER_AOT_ARTIFACT_VERSION } from "../../src/runtime/preorder-aot-artifact.ts";

import { installPreorderAotRuntime } from "../../src/runtime/preorder-aot-runtime.ts";

import type { RuntimeRouteHandler } from "../../src/runtime/types.ts";

import { compileFlatAotArtifact } from "../../src/tooling/flat-aot-artifact-compiler.ts";

import { compilePreorderAotArtifact } from "../../src/tooling/preorder-aot-artifact-compiler.ts";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler.ts";

const ROUTES = 5000;

const STATIC_ROUTES = 2500;

const DYNAMIC_ROUTES = 2500;

const profile = process.env.MIX_PROFILE;

const scenario = process.env.SCENARIO;

if (
  profile !== "g0" &&
  profile !== "g1" &&
  profile !== "g10" &&
  profile !== "g100" &&
  profile !== "g500" &&
  profile !== "g1250" &&
  profile !== "g2500"
) {
  throw new Error(`Invalid MIX_PROFILE: ${profile}`);
}

if (scenario !== "flat" && scenario !== "preorder") {
  throw new Error(`Invalid SCENARIO: ${scenario}`);
}

type MixProfile = typeof profile;

const RESPONSE = new Response(
  null,

  {
    status: 204,
  },
);

const HANDLER: RuntimeRouteHandler = () => RESPONSE;

const genericCount = genericCountForProfile(profile);

const trailingCount = DYNAMIC_ROUTES - genericCount;

/*
 * Registration order is deliberately fixed:
 *
 * static -> trailing -> generic
 *
 * This exercises the real transition where the first
 * generic route activates the dynamic trie after
 * trailing-param routes have already been registered.
 *
 * All compilation remains outside the runtime timer.
 */
const routeShapes = createRouteShapes(genericCount, trailingCount);

const plan = await compileSemanticRoutePlan(routeShapes);

const flatArtifact = compileFlatAotArtifact(plan);

const preorderArtifact = compilePreorderAotArtifact(plan);

const handlers = new Array<RuntimeRouteHandler>(ROUTES);

handlers.fill(HANDLER);

const target = targetPath(genericCount, trailingCount);

const readyStarted = performance.now();

const app = new Gelis();

const installStarted = performance.now();

if (scenario === "flat") {
  installFlatAotRuntime(
    app,

    flatArtifact,

    {
      version: FLAT_AOT_ARTIFACT_VERSION,

      shapeFingerprint: flatArtifact[2],

      handlers,
    },
  );
} else {
  installPreorderAotRuntime(
    app,

    preorderArtifact,

    {
      version: PREORDER_AOT_ARTIFACT_VERSION,

      shapeFingerprint: preorderArtifact[2],

      handlers,
    },
  );
}

const installMs = performance.now() - installStarted;

const readyMs = performance.now() - readyStarted;

const firstStarted = performance.now();

const response = await app.fetch(new Request(`http://gelis.test${target}`));

const firstFetchUs = (performance.now() - firstStarted) * 1000;

if (response.status !== 204) {
  throw new Error(`Unexpected first response status: ${response.status}`);
}

console.log(
  JSON.stringify({
    profile,

    scenario,

    genericCount,

    trailingCount,

    installMs,

    readyMs,

    firstFetchUs,
  }),
);

function createRouteShapes(
  genericRoutes: number,

  trailingRoutes: number,
): readonly {
  readonly method: "GET";

  readonly path: string;
}[] {
  const result = new Array<{
    method: "GET";

    path: string;
  }>(ROUTES);

  let cursor = 0;

  for (let index = 0; index < STATIC_ROUTES; index++) {
    result[cursor++] = {
      method: "GET",

      path: `/s/${index}`,
    };
  }

  for (let index = 0; index < trailingRoutes; index++) {
    result[cursor++] = {
      method: "GET",

      path: `/t/${index}/:id`,
    };
  }

  for (let index = 0; index < genericRoutes; index++) {
    result[cursor++] = {
      method: "GET",

      path: `/g/${index}/:id/detail`,
    };
  }

  if (cursor !== ROUTES) {
    throw new Error(`Unexpected selective policy route count: ${cursor}`);
  }

  return result;
}

function targetPath(
  genericRoutes: number,

  trailingRoutes: number,
): string {
  if (genericRoutes !== 0) {
    return `/g/${genericRoutes - 1}/target/detail`;
  }

  return `/t/${trailingRoutes - 1}/target`;
}

function genericCountForProfile(value: MixProfile): number {
  switch (value) {
    case "g0":
      return 0;

    case "g1":
      return 1;

    case "g10":
      return 10;

    case "g100":
      return 100;

    case "g500":
      return 500;

    case "g1250":
      return 1250;

    case "g2500":
      return 2500;
  }
}

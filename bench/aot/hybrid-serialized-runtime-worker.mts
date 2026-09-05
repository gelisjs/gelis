import { GELIS_INTERNAL_RUNTIME, Gelis } from "../../src/app.ts";

import { FLAT_AOT_ARTIFACT_VERSION } from "../../src/runtime/flat-aot-artifact.ts";

import type { FlatAotArtifact } from "../../src/runtime/flat-aot-artifact.ts";

import {
  bindFlatRoutes,
  hydrateFlatRouter,
} from "../../src/runtime/flat-aot-runtime.ts";

import type { RuntimeRouteHandler } from "../../src/runtime/types.ts";

import { hydrateHybridAotRouterCandidate } from "./hybrid-aot-candidate.mts";

import type { HybridAotArtifactCandidate } from "./hybrid-aot-candidate.mts";

const ROUTES = 5000;

const scenario = process.env.SCENARIO;

const shape = process.env.SHAPE_KIND;

const artifactPath = process.env.ARTIFACT_PATH;

const expectedFingerprint = process.env.SHAPE_FINGERPRINT;

if (scenario !== "current-flat" && scenario !== "hybrid") {
  throw new Error(`Invalid SCENARIO: ${scenario}`);
}

if (shape !== "shared" && shape !== "unique" && shape !== "multi") {
  throw new Error(`Invalid SHAPE_KIND: ${shape}`);
}

if (artifactPath === undefined) {
  throw new Error("Missing ARTIFACT_PATH");
}

if (expectedFingerprint === undefined) {
  throw new Error("Missing SHAPE_FINGERPRINT");
}

type ShapeKind = typeof shape;

const RESPONSE = new Response(null, {
  status: 204,
});

const HANDLER: RuntimeRouteHandler = () => RESPONSE;

/*
 * Handler acquisition and Gelis construction are deliberately
 * outside the serialized artifact runtime timer.
 */
const handlers = new Array<RuntimeRouteHandler>(ROUTES);

handlers.fill(HANDLER);

const app = new Gelis();

const readyStarted = performance.now();

const loadStarted = performance.now();

const text = await Bun.file(artifactPath).text();

const loadMs = performance.now() - loadStarted;

const parseStarted = performance.now();

const parsed = JSON.parse(text) as FlatAotArtifact | HybridAotArtifactCandidate;

const parseMs = performance.now() - parseStarted;

const validateStarted = performance.now();

const [
  version,
  routeCount,
  shapeFingerprint,
  methodNames,
  routeMethodIds,
  routePaths,
] = parsed;

if (version !== FLAT_AOT_ARTIFACT_VERSION) {
  throw new Error("Unsupported serialized AOT artifact version");
}

if (shapeFingerprint !== expectedFingerprint) {
  throw new Error("Serialized AOT artifact fingerprint mismatch");
}

if (
  routeCount !== routeMethodIds.length ||
  routeCount !== routePaths.length ||
  routeCount !== handlers.length
) {
  throw new Error("Serialized AOT artifact route count mismatch");
}

const validateMs = performance.now() - validateStarted;

const bindStarted = performance.now();

const routes = bindFlatRoutes(
  routeCount,

  methodNames,

  routeMethodIds,

  routePaths,

  handlers,
);

const bindMs = performance.now() - bindStarted;

const hydrateStarted = performance.now();

const router =
  scenario === "current-flat"
    ? hydrateFlatRouter(
        methodNames,

        (parsed as FlatAotArtifact)[6],

        routes,
      )
    : hydrateHybridAotRouterCandidate(
        methodNames,

        (parsed as HybridAotArtifactCandidate)[6],

        routes,
      );

const hydrateMs = performance.now() - hydrateStarted;

const installStarted = performance.now();

app[GELIS_INTERNAL_RUNTIME]().installPrebuiltRuntime(
  router,

  routes,
);

const installMs = performance.now() - installStarted;

const readyMs = performance.now() - readyStarted;

const firstStarted = performance.now();

const response = await app.fetch(
  new Request(`http://gelis.test${targetPath(shape)}`),
);

const firstFetchUs = (performance.now() - firstStarted) * 1000;

if (response.status !== 204) {
  throw new Error(`Unexpected response status: ${response.status}`);
}

console.log(
  JSON.stringify({
    scenario,

    shapeKind: shape,

    bytes: Buffer.byteLength(text, "utf8"),

    loadMs,

    parseMs,

    validateMs,

    bindMs,

    hydrateMs,

    installMs,

    readyMs,

    firstFetchUs,
  }),
);

function targetPath(kind: ShapeKind): string {
  const index = ROUTES - 1;

  switch (kind) {
    case "shared":
    case "unique":
      return `/r/${index}/target/detail`;

    case "multi":
      return `/r/${index}/core/users/42/detail`;
  }
}

import { GELIS_INTERNAL_RUNTIME, type Gelis } from "../app";

import { assertRouteMethod } from "../http-method";

import type { RouteOptions } from "../route";

import {
  createRuntimeRouteContractMetadata,
  RUNTIME_ROUTE_CONTRACT_METADATA,
} from "./contract-metadata";

import type { RuntimeRouteContractMetadata } from "./contract-metadata";

import { FLAT_AOT_ARTIFACT_VERSION } from "./flat-aot-artifact";

import type { FlatAotArtifact } from "./flat-aot-artifact";

import { hydrateFlatRouter } from "./flat-aot-runtime";

import { createRuntimeInputPlan } from "./input";

import type { RuntimeInputPlan } from "./input";

import { RUNTIME_ROUTE_INPUT, RUNTIME_ROUTE_PLAIN } from "./types";

import type { RuntimeRouteHandler, RuntimeRouteRecord } from "./types";

export interface FlatAotManagedInputBinding {
  readonly handler: RuntimeRouteHandler;

  readonly input: RuntimeInputPlan;

  readonly contractMetadata: RuntimeRouteContractMetadata | undefined;
}

export type FlatAotManagedInputBindings = readonly (
  | FlatAotManagedInputBinding
  | undefined
)[];

export interface FlatAotManagedRuntimeBinding {
  readonly version: typeof FLAT_AOT_ARTIFACT_VERSION;

  readonly shapeFingerprint: string;

  readonly handlers: readonly RuntimeRouteHandler[];

  readonly inputBindings: FlatAotManagedInputBindings;
}

/*
 * Generated source calls this at the original route declaration position.
 *
 * The helper deliberately reuses the normal registration-time input compiler
 * so AOT does not grow a second request-body parser compiler.
 */
export function captureFlatAotManagedInput(
  options: RouteOptions,

  handler: RuntimeRouteHandler,
): FlatAotManagedInputBinding {
  if (options.responses !== undefined) {
    throw new TypeError(
      "Gelis managed request-body AOT does not support response contracts",
    );
  }

  const input = createRuntimeInputPlan(options);

  if (input === undefined || input.body === undefined) {
    throw new TypeError(
      "Gelis managed request-body AOT requires a body schema",
    );
  }

  return {
    handler,

    input,

    contractMetadata: createRuntimeRouteContractMetadata(options.openapi),
  };
}

/*
 * Mixed/managed AOT installation is intentionally separate from the
 * existing plain-only binder. Plain-only applications continue through
 * installFlatAotRuntime() without allocating or checking an input sidecar.
 */
export function installFlatAotManagedRuntime(
  app: Gelis,

  artifact: FlatAotArtifact,

  binding: FlatAotManagedRuntimeBinding,
): void {
  const [
    version,
    routeCount,
    shapeFingerprint,
    methodNames,
    routeMethodIds,
    routePaths,
    flatRouter,
  ] = artifact;

  if (version !== FLAT_AOT_ARTIFACT_VERSION) {
    throw new Error("Unsupported Gelis flat AOT artifact version");
  }

  if (binding.version !== FLAT_AOT_ARTIFACT_VERSION) {
    throw new Error("Unsupported Gelis flat AOT runtime binding version");
  }

  if (shapeFingerprint !== binding.shapeFingerprint) {
    throw new Error("Gelis flat AOT artifact fingerprint mismatch");
  }

  if (
    routeCount !== routeMethodIds.length ||
    routeCount !== routePaths.length ||
    routeCount !== binding.handlers.length ||
    routeCount !== binding.inputBindings.length
  ) {
    throw new Error("Gelis flat AOT artifact route count mismatch");
  }

  const routes = bindFlatManagedRoutes(
    routeCount,
    methodNames,
    routeMethodIds,
    routePaths,
    binding.handlers,
    binding.inputBindings,
  );

  const router = hydrateFlatRouter(
    methodNames,
    flatRouter,
    routes,
  );

  const control = app[GELIS_INTERNAL_RUNTIME]();

  control.installPrebuiltRuntime(
    router,
    routes,
  );
}

function bindFlatManagedRoutes(
  routeCount: number,

  methodNames: readonly string[],

  routeMethodIds: readonly number[],

  routePaths: readonly string[],

  handlers: readonly RuntimeRouteHandler[],

  inputBindings: FlatAotManagedInputBindings,
): RuntimeRouteRecord[] {
  const routes = new Array<RuntimeRouteRecord>(routeCount);

  for (let index = 0; index < routeCount; index++) {
    const methodId = routeMethodIds[index];

    const path = routePaths[index];

    if (methodId === undefined || path === undefined) {
      throw new Error(`Missing Gelis flat AOT route binding: ${index}`);
    }

    const methodName = methodNames[methodId];

    if (methodName === undefined) {
      throw new Error(`Invalid Gelis flat AOT method id: ${methodId}`);
    }

    assertRouteMethod(methodName);

    const inputBinding = inputBindings[index];

    if (inputBinding === undefined) {
      const handler = handlers[index];

      if (handler === undefined) {
        throw new Error(`Missing Gelis flat AOT route binding: ${index}`);
      }

      routes[index] = {
        method: methodName,
        path,
        handler,
        flags: RUNTIME_ROUTE_PLAIN,
        input: undefined,
        beforeHandle: undefined,
        afterHandle: undefined,
        responses: undefined,
      };

      continue;
    }

    const route: RuntimeRouteRecord = {
      method: methodName,
      path,
      handler: inputBinding.handler,
      flags: RUNTIME_ROUTE_INPUT,
      input: inputBinding.input,
      beforeHandle: undefined,
      afterHandle: undefined,
      responses: undefined,
    };

    const contractMetadata = inputBinding.contractMetadata;

    if (contractMetadata !== undefined) {
      Object.defineProperty(route, RUNTIME_ROUTE_CONTRACT_METADATA, {
        enumerable: true,
        value: contractMetadata,
      });
    }

    routes[index] = route;
  }

  return routes;
}

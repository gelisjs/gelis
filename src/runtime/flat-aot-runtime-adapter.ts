import type { Gelis } from "../app";

import { FLAT_AOT_ARTIFACT_VERSION } from "./flat-aot-artifact";

import type { FlatAotArtifact } from "./flat-aot-artifact";

import {
  captureFlatAotManagedInput,
  installFlatAotManagedRuntime,
} from "./flat-aot-managed-input";

import type { FlatAotManagedInputBindings } from "./flat-aot-managed-input";

import { installFlatAotRuntime } from "./flat-aot-runtime";

import type { RuntimeRouteHandler } from "./types";

export { captureFlatAotManagedInput };

export type FlatAotRuntimeInstaller = (
  app: Gelis,

  handlers: readonly RuntimeRouteHandler[],

  inputBindings?: FlatAotManagedInputBindings,
) => void;

/*
 * Bind a transported FlatAotArtifact to the independently
 * generated source-shape fingerprint expected by the
 * rewritten application.
 *
 * Validation intentionally occurs only when the generated
 * installation boundary is reached. Creating the adapter
 * itself must not move observable source side effects.
 */
export function createFlatAotRuntimeAdapter(
  artifact: FlatAotArtifact,

  expectedShapeFingerprint: string,
): FlatAotRuntimeInstaller {
  return (app, handlers, inputBindings): void => {
    if (inputBindings === undefined) {
      installFlatAotRuntime(
        app,

        artifact,

        {
          version: FLAT_AOT_ARTIFACT_VERSION,

          shapeFingerprint: expectedShapeFingerprint,

          handlers,
        },
      );

      return;
    }

    installFlatAotManagedRuntime(
      app,

      artifact,

      {
        version: FLAT_AOT_ARTIFACT_VERSION,

        shapeFingerprint: expectedShapeFingerprint,

        handlers,

        inputBindings,
      },
    );
  };
}

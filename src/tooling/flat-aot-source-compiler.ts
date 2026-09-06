import type { FlatAotArtifact } from "../runtime/flat-aot-artifact";

import type {
  AotSourceCompilation,
  CompileAotSourceOptions,
} from "./aot-source-compiler";

import { compileAotSource } from "./aot-source-compiler";

import { compileFlatAotArtifact } from "./flat-aot-artifact-compiler";

export interface FlatAotSourceCompilation extends AotSourceCompilation {
  /*
   * Undefined when the source contains no eligible routes.
   *
   * The source compiler deliberately remains independent
   * from artifact transport and filesystem concerns.
   */
  readonly artifact: FlatAotArtifact | undefined;
}

export async function compileFlatAotSource(
  sourceText: string,

  options: CompileAotSourceOptions = {},
): Promise<FlatAotSourceCompilation> {
  const source = await compileAotSource(sourceText, options);

  if (source.plan === undefined) {
    if (source.routeCount !== 0) {
      throw new Error(
        "Gelis flat AOT source compilation is missing its semantic plan",
      );
    }

    return {
      ...source,

      artifact: undefined,
    };
  }

  const artifact = compileFlatAotArtifact(source.plan);

  if (
    artifact[1] !== source.routeCount ||
    artifact[2] !== source.plan.shapeFingerprint
  ) {
    throw new Error("Gelis flat AOT source compilation mismatch");
  }

  return {
    ...source,

    artifact,
  };
}

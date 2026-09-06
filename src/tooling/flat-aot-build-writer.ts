import type { CompileAotSourceOptions } from "./aot-source-compiler";

import { emitFlatAotModule } from "./flat-aot-module-emitter";

import { compileFlatAotSource } from "./flat-aot-source-compiler";

export interface FlatAotBuildWriterHost {
  /*
   * Write one complete text file atomically.
   *
   * The host is responsible for creating parent
   * directories when necessary and for ensuring
   * readers never observe partially written content.
   */
  writeTextFileAtomically(path: string, content: string): Promise<void>;
}

export interface WriteFlatAotBuildOptions {
  readonly modulePath: string;

  readonly runtimeAdapterImport: string;

  readonly host: FlatAotBuildWriterHost;

  readonly compileOptions?: CompileAotSourceOptions;

  readonly runtimeAdapterIdentifier?: string;

  readonly artifactIdentifier?: string;
}

export interface FlatAotBuildOutput {
  readonly modulePath: string;

  readonly artifactPath: string | undefined;

  readonly routeCount: number;

  readonly shapeFingerprint: string | undefined;
}

/*
 * Compile and publish one Flat AOT application build.
 *
 * Route artifacts are immutable and addressed by the
 * semantic shape fingerprint. The artifact is published
 * before the generated module that references it.
 *
 * Filesystem semantics are delegated to the build host so
 * Gelis core tooling remains independent from Node.js,
 * Bun and any particular bundler.
 *
 * Old fingerprinted artifacts are intentionally retained.
 * Garbage collection belongs to a separate build concern.
 */
export async function writeFlatAotBuildOutput(
  sourceText: string,

  options: WriteFlatAotBuildOptions,
): Promise<FlatAotBuildOutput> {
  if (options.modulePath.trim().length === 0) {
    throw new Error("Gelis flat AOT output module path must not be empty");
  }

  const modulePath = options.modulePath;

  const fileName = options.compileOptions?.fileName ?? modulePath;

  /*
   * Complete compilation before publishing anything.
   * Unsupported source therefore cannot partially mutate
   * a previous successful build.
   */
  const compilation = await compileFlatAotSource(
    sourceText,

    {
      ...options.compileOptions,

      fileName,
    },
  );

  let artifactPath: string | undefined;

  let artifactImport = "./unused.gelis-aot.json";

  if (compilation.routeCount !== 0) {
    const fingerprint = compilation.plan?.shapeFingerprint;

    if (fingerprint === undefined) {
      throw new Error(
        "Gelis flat AOT build output is missing its shape fingerprint",
      );
    }

    const artifactFileName = createArtifactFileName(modulePath, fingerprint);

    artifactPath = siblingPath(modulePath, artifactFileName);

    artifactImport = `./${artifactFileName}`;
  }

  const emissionOptions = {
    fileName,

    runtimeAdapterImport: options.runtimeAdapterImport,

    artifactImport,

    ...(options.runtimeAdapterIdentifier === undefined
      ? {}
      : {
          runtimeAdapterIdentifier: options.runtimeAdapterIdentifier,
        }),

    ...(options.artifactIdentifier === undefined
      ? {}
      : {
          artifactIdentifier: options.artifactIdentifier,
        }),
  };

  const emission = emitFlatAotModule(compilation, emissionOptions);

  if (emission.artifactJson !== undefined) {
    if (artifactPath === undefined) {
      throw new Error(
        "Gelis flat AOT build output is missing its artifact path",
      );
    }

    /*
     * The immutable artifact must exist before the new
     * module revision can become visible.
     */
    await options.host.writeTextFileAtomically(
      artifactPath,
      emission.artifactJson,
    );
  } else if (artifactPath !== undefined) {
    throw new Error(
      "Gelis flat AOT build output produced an unexpected artifact path",
    );
  }

  /*
   * Publish the generated module last.
   */
  await options.host.writeTextFileAtomically(modulePath, emission.code);

  return {
    modulePath,

    artifactPath,

    routeCount: emission.routeCount,

    shapeFingerprint: emission.shapeFingerprint,
  };
}

function createArtifactFileName(
  modulePath: string,

  shapeFingerprint: string,
): string {
  const fileName = pathFileName(modulePath);

  const extensionIndex = fileName.lastIndexOf(".");

  const moduleName =
    extensionIndex <= 0 ? fileName : fileName.slice(0, extensionIndex);

  return `${moduleName}.` + `${shapeFingerprint}.` + "gelis-aot.json";
}

function siblingPath(
  path: string,

  siblingFileName: string,
): string {
  const separatorIndex = lastSeparatorIndex(path);

  if (separatorIndex === -1) {
    return siblingFileName;
  }

  return path.slice(0, separatorIndex + 1) + siblingFileName;
}

function pathFileName(path: string): string {
  const separatorIndex = lastSeparatorIndex(path);

  return path.slice(separatorIndex + 1);
}

function lastSeparatorIndex(path: string): number {
  return Math.max(
    path.lastIndexOf("/"),

    path.lastIndexOf("\\"),
  );
}

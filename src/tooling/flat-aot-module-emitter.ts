import * as ts from "@typescript/typescript6";

import { AotSourceUnsupportedError } from "./aot-source-analyzer";

import type { FlatAotSourceCompilation } from "./flat-aot-source-compiler";

const DEFAULT_RUNTIME_ADAPTER_IDENTIFIER = "__gelisCreateFlatAotRuntimeAdapter";

const DEFAULT_ARTIFACT_IDENTIFIER = "__gelisFlatAotArtifact";

export interface EmitFlatAotModuleOptions {
  readonly runtimeAdapterImport: string;

  readonly artifactImport: string;

  readonly fileName?: string;

  readonly runtimeAdapterIdentifier?: string;

  readonly artifactIdentifier?: string;
}

export interface FlatAotModuleEmission {
  readonly code: string;

  readonly artifactJson: string | undefined;

  readonly routeCount: number;

  readonly shapeFingerprint: string | undefined;
}

/*
 * Produce transport-ready build output without performing
 * filesystem I/O.
 *
 * The caller owns where the module and JSON artifact are
 * written. This keeps source compilation independent from
 * Bun, Node.js and any particular bundler.
 */
export function emitFlatAotModule(
  compilation: FlatAotSourceCompilation,

  options: EmitFlatAotModuleOptions,
): FlatAotModuleEmission {
  if (compilation.routeCount === 0) {
    if (compilation.plan !== undefined || compilation.artifact !== undefined) {
      throw new Error(
        "Gelis zero-route AOT compilation unexpectedly contains build artifacts",
      );
    }

    return {
      code: compilation.code,

      artifactJson: undefined,

      routeCount: 0,

      shapeFingerprint: undefined,
    };
  }

  const plan = compilation.plan;

  const artifact = compilation.artifact;

  if (plan === undefined || artifact === undefined) {
    throw new Error(
      "Gelis flat AOT module emission is missing compilation artifacts",
    );
  }

  if (
    artifact[1] !== compilation.routeCount ||
    artifact[2] !== plan.shapeFingerprint
  ) {
    throw new Error("Gelis flat AOT module emission fingerprint mismatch");
  }

  assertImportSpecifier(
    options.runtimeAdapterImport,

    "runtime adapter",
  );

  assertImportSpecifier(
    options.artifactImport,

    "artifact",
  );

  const fileName = options.fileName ?? "application.ts";

  const runtimeAdapterIdentifier =
    options.runtimeAdapterIdentifier ?? DEFAULT_RUNTIME_ADAPTER_IDENTIFIER;

  const artifactIdentifier =
    options.artifactIdentifier ?? DEFAULT_ARTIFACT_IDENTIFIER;

  if (runtimeAdapterIdentifier === artifactIdentifier) {
    throw new AotSourceUnsupportedError(
      `${fileName}: generated AOT identifiers must be unique`,
    );
  }

  assertGeneratedIdentifierAvailable(
    compilation.code,
    fileName,
    runtimeAdapterIdentifier,
  );

  assertGeneratedIdentifierAvailable(
    compilation.code,
    fileName,
    artifactIdentifier,
  );

  const prelude = [
    `import { createFlatAotRuntimeAdapter as ${runtimeAdapterIdentifier} } from ${JSON.stringify(
      options.runtimeAdapterImport,
    )};`,

    `import ${artifactIdentifier} from ${JSON.stringify(
      options.artifactImport,
    )} with { type: "json" };`,

    "",

    `const ${compilation.installerIdentifier} = ${runtimeAdapterIdentifier}(`,

    `  ${artifactIdentifier},`,

    `  ${JSON.stringify(plan.shapeFingerprint)},`,

    ");",
  ].join("\n");

  return {
    code: insertModulePrelude(compilation.code, prelude, fileName),

    artifactJson: JSON.stringify(artifact),

    routeCount: compilation.routeCount,

    shapeFingerprint: plan.shapeFingerprint,
  };
}

function insertModulePrelude(
  code: string,

  prelude: string,

  fileName: string,
): string {
  const sourceFile = ts.createSourceFile(
    fileName,

    code,

    ts.ScriptTarget.Latest,

    true,

    scriptKindFor(fileName),
  );

  const firstStatement = sourceFile.statements[0];

  let offset =
    firstStatement === undefined
      ? shebangEnd(code)
      : firstStatement.getStart(sourceFile, false);

  for (const statement of sourceFile.statements) {
    if (!isModulePreludeStatement(statement)) {
      break;
    }

    offset = statement.getEnd();
  }

  return code.slice(0, offset) + `\n\n${prelude}\n\n` + code.slice(offset);
}

function isModulePreludeStatement(statement: ts.Statement): boolean {
  if (
    ts.isImportDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement) ||
    ts.isExportDeclaration(statement)
  ) {
    return true;
  }

  return (
    ts.isExpressionStatement(statement) &&
    ts.isStringLiteral(statement.expression)
  );
}

function assertGeneratedIdentifierAvailable(
  sourceText: string,

  fileName: string,

  identifier: string,
): void {
  const sourceFile = ts.createSourceFile(
    fileName,

    sourceText,

    ts.ScriptTarget.Latest,

    true,

    scriptKindFor(fileName),
  );

  let collision = false;

  visit(sourceFile);

  if (collision) {
    throw new AotSourceUnsupportedError(
      `${fileName}: generated AOT identifier ${identifier} already exists`,
    );
  }

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text === identifier) {
      collision = true;

      return;
    }

    ts.forEachChild(node, visit);
  }
}

function assertImportSpecifier(
  value: string,

  kind: string,
): void {
  if (value.trim().length === 0) {
    throw new Error(
      `Gelis flat AOT ${kind} import specifier must not be empty`,
    );
  }
}

function shebangEnd(sourceText: string): number {
  if (!sourceText.startsWith("#!")) {
    return 0;
  }

  const newline = sourceText.indexOf("\n");

  return newline === -1 ? sourceText.length : newline + 1;
}

function scriptKindFor(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }

  if (fileName.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }

  if (
    fileName.endsWith(".js") ||
    fileName.endsWith(".mjs") ||
    fileName.endsWith(".cjs")
  ) {
    return ts.ScriptKind.JS;
  }

  return ts.ScriptKind.TS;
}

import * as ts from "@typescript/typescript6";

import type { SemanticRoutePlan } from "../runtime/semantic-route-plan";

import { rewriteAotSource } from "./aot-source-rewriter";

import { analyzeAotSourceSafety } from "./aot-source-safety";

import { compileSemanticRoutePlan } from "./semantic-route-plan-compiler";

import { AotSourceUnsupportedError } from "./aot-source-analyzer";

const DEFAULT_HANDLER_IDENTIFIER = "__gelisAotHandlers";

const DEFAULT_INSTALLER_IDENTIFIER = "__gelisAotInstall";

export interface CompileAotSourceOptions {
  readonly fileName?: string;

  readonly appIdentifier?: string;

  readonly handlerArrayIdentifier?: string;

  readonly installerIdentifier?: string;
}

export interface AotSourceCompilation {
  readonly code: string;

  readonly routeCount: number;

  readonly handlerArrayIdentifier: string;

  readonly installerIdentifier: string;

  readonly installBeforeOffset: number | undefined;

  readonly plan: SemanticRoutePlan | undefined;
}

export async function compileAotSource(
  sourceText: string,

  options: CompileAotSourceOptions = {},
): Promise<AotSourceCompilation> {
  const fileName = options.fileName ?? "application.ts";

  const appIdentifier = options.appIdentifier ?? "app";

  const handlerArrayIdentifier =
    options.handlerArrayIdentifier ?? DEFAULT_HANDLER_IDENTIFIER;

  const installerIdentifier =
    options.installerIdentifier ?? DEFAULT_INSTALLER_IDENTIFIER;

  const safety = analyzeAotSourceSafety(
    sourceText,

    fileName,

    appIdentifier,
  );

  if (safety.analysis.routes.length === 0) {
    return {
      code: sourceText,

      routeCount: 0,

      handlerArrayIdentifier,

      installerIdentifier,

      installBeforeOffset: undefined,

      plan: undefined,
    };
  }

  assertIdentifierAvailable(
    sourceText,

    fileName,

    installerIdentifier,
  );

  const installBeforeOffset = safety.installBeforeOffset;

  if (installBeforeOffset === undefined) {
    throw new Error("Missing AOT installation boundary");
  }

  const routeShapes = safety.analysis.routes.map((route) => ({
    method: route.method,

    path: route.path,
  }));

  const plan = await compileSemanticRoutePlan(routeShapes);

  const rewrite = rewriteAotSource(
    sourceText,

    fileName,

    appIdentifier,

    handlerArrayIdentifier,

    [
      {
        offset: installBeforeOffset,

        text:
          `\n\n${installerIdentifier}(` +
          `${appIdentifier}, ${handlerArrayIdentifier});\n`,
      },
    ],
  );

  return {
    code: rewrite.code,

    routeCount: rewrite.routeCount,

    handlerArrayIdentifier,

    installerIdentifier,

    installBeforeOffset,

    plan,
  };
}

function assertIdentifierAvailable(
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
      `${fileName}: internal AOT identifier ${identifier} already exists`,
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

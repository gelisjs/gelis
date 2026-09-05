import * as ts from "@typescript/typescript6";

import {
  analyzeAotSource,
  AotSourceUnsupportedError,
} from "./aot-source-analyzer";

import type { AotSourceAnalysis } from "./aot-source-analyzer";

export interface AotSourceSafety {
  readonly analysis: AotSourceAnalysis;

  /**
   * The offset where E6-D must insert `installPrebuiltRuntime()`.
   *
   * `undefined` indicates there are no AOT routes,
   * so installation is not required.
   */
  readonly installBeforeOffset: number | undefined;
}

export function analyzeAotSourceSafety(
  sourceText: string,

  fileName = "application.ts",

  appIdentifier = "app",
): AotSourceSafety {
  const analysis = analyzeAotSource(sourceText, fileName, appIdentifier);

  if (analysis.routes.length === 0) {
    return {
      analysis,

      installBeforeOffset: undefined,
    };
  }

  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(fileName),
  );

  const routeStatementStarts = new Set<number>();

  let lastRouteEnd = 0;

  for (const route of analysis.routes) {
    routeStatementStarts.add(route.statementStart);

    if (route.statementEnd > lastRouteEnd) {
      lastRouteEnd = route.statementEnd;
    }
  }

  /**
   * If there are no `app.use()` calls after the last route,
   * installation can be performed at the end of the module.
   *
   * This prevents moving internal AOT work ahead of
   * ordinary user side effects without a reason.
   */
  let installBeforeOffset = sourceText.length;

  visit(sourceFile);

  return {
    analysis,

    installBeforeOffset,
  };

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text === appIdentifier) {
      inspectAppReference(node);
    }

    ts.forEachChild(node, visit);
  }

  function inspectAppReference(identifier: ts.Identifier): void {
    if (isCanonicalDeclarationName(identifier)) {
      return;
    }

    if (isAnalyzedRouteReceiver(identifier)) {
      return;
    }

    const position = identifier.getStart(sourceFile);

    /*
     * onRequest/onError are application wrappers.
     *
     * Their compiled fetch still reads state.router
     * when a request actually occurs, therefore they
     * may safely be registered before prebuilt router
     * installation.
     */
    if (position < lastRouteEnd && isSafePreinstallHookReceiver(identifier)) {
      return;
    }

    /*
     * Any other use before all handler expressions
     * have been acquired is unsafe.
     *
     * Installing the prebuilt router here would be
     * too early, while leaving app incomplete could
     * expose different semantics.
     */
    if (position < lastRouteEnd) {
      throw unsupported(
        identifier,

        `${describeAppUse(identifier)} before final AOT route is not supported`,
      );
    }

    /*
     * After the final route, arbitrary application
     * use is safe only after state-complete runtime
     * installation.
     *
     * Record the earliest top-level statement that
     * observes/uses the application.
     */
    const topLevel = findTopLevelNode(identifier);

    const boundary = topLevel.getStart(sourceFile);

    if (boundary < installBeforeOffset) {
      installBeforeOffset = boundary;
    }
  }

  function isCanonicalDeclarationName(identifier: ts.Identifier): boolean {
    const parent = identifier.parent;

    if (!ts.isVariableDeclaration(parent) || parent.name !== identifier) {
      return false;
    }

    const declarationList = parent.parent;

    const statement = declarationList.parent;

    return (
      ts.isVariableDeclarationList(declarationList) &&
      ts.isVariableStatement(statement) &&
      statement.parent === sourceFile
    );
  }

  function isAnalyzedRouteReceiver(identifier: ts.Identifier): boolean {
    const property = identifier.parent;

    if (
      !ts.isPropertyAccessExpression(property) ||
      property.expression !== identifier
    ) {
      return false;
    }

    const call = property.parent;

    if (!ts.isCallExpression(call) || call.expression !== property) {
      return false;
    }

    const statement = call.parent;

    if (
      !ts.isExpressionStatement(statement) ||
      statement.parent !== sourceFile
    ) {
      return false;
    }

    return routeStatementStarts.has(statement.getStart(sourceFile));
  }

  function isSafePreinstallHookReceiver(identifier: ts.Identifier): boolean {
    const property = identifier.parent;

    if (
      !ts.isPropertyAccessExpression(property) ||
      property.expression !== identifier
    ) {
      return false;
    }

    const method = property.name.text;

    if (method !== "onRequest" && method !== "onError") {
      return false;
    }

    const call = property.parent;

    if (!ts.isCallExpression(call) || call.expression !== property) {
      return false;
    }

    const statement = call.parent;

    return (
      ts.isExpressionStatement(statement) && statement.parent === sourceFile
    );
  }

  function findTopLevelNode(node: ts.Node): ts.Node {
    let current = node;

    while (current.parent !== sourceFile) {
      const parent = current.parent;

      if (parent === undefined) {
        throw new Error("Unable to locate top-level application use");
      }

      current = parent;
    }

    return current;
  }

  function describeAppUse(identifier: ts.Identifier): string {
    const parent = identifier.parent;

    if (
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === identifier
    ) {
      return `${appIdentifier}.${parent.name.text}`;
    }

    return `${appIdentifier} reference`;
  }

  function unsupported(
    node: ts.Node,

    reason: string,
  ): AotSourceUnsupportedError {
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );

    return new AotSourceUnsupportedError(
      `${fileName}:${position.line + 1}:${position.character + 1}: ${reason}`,
    );
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

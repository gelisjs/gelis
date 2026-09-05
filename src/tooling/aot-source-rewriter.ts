import * as ts from "@typescript/typescript6";

import {
  analyzeAotSource,
  AotSourceUnsupportedError,
} from "./aot-source-analyzer";

const DEFAULT_HANDLER_IDENTIFIER = "__gelisAotHandlers";

export interface AotSourceRewrite {
  readonly code: string;

  readonly handlerArrayIdentifier: string;

  readonly routeCount: number;
}

interface SourceEdit {
  readonly start: number;

  readonly end: number;

  readonly text: string;
}

export function rewriteAotSource(
  sourceText: string,

  fileName = "application.ts",

  appIdentifier = "app",

  handlerArrayIdentifier = DEFAULT_HANDLER_IDENTIFIER,
): AotSourceRewrite {
  const analysis = analyzeAotSource(sourceText, fileName, appIdentifier);

  if (analysis.routes.length === 0) {
    return {
      code: sourceText,

      handlerArrayIdentifier,

      routeCount: 0,
    };
  }

  assertIdentifierAvailable(sourceText, fileName, handlerArrayIdentifier);

  const appDeclarationEnd = findAppDeclarationEnd(
    sourceText,
    fileName,
    appIdentifier,
  );

  const edits: SourceEdit[] = [];

  edits.push({
    start: appDeclarationEnd,

    end: appDeclarationEnd,

    text: `\n\nconst ${handlerArrayIdentifier} = new Array(${analysis.routes.length});`,
  });

  for (let index = 0; index < analysis.routes.length; index++) {
    const route = analysis.routes[index];

    if (route === undefined) {
      throw new Error(`Missing analyzed route: ${index}`);
    }

    const handlerSource = sourceText.slice(
      route.handlerStart,
      route.handlerEnd,
    );

    edits.push({
      start: route.statementStart,

      end: route.statementEnd,

      text: `${handlerArrayIdentifier}[${index}] = ${handlerSource};`,
    });
  }

  /*
   * Apply from right to left so original source
   * offsets remain valid.
   *
   * When an insertion and replacement share the
   * same start position, the longer replacement
   * is applied first.
   */
  edits.sort((left, right) => right.start - left.start || right.end - left.end);

  let code = sourceText;

  for (const edit of edits) {
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  }

  return {
    code,

    handlerArrayIdentifier,

    routeCount: analysis.routes.length,
  };
}

function findAppDeclarationEnd(
  sourceText: string,

  fileName: string,

  appIdentifier: string,
): number {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(fileName),
  );

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === appIdentifier
      ) {
        return statement.getEnd();
      }
    }
  }

  /*
   * analyzeAotSource() already validated this.
   * Reaching here means the two passes disagree.
   */
  throw new Error(
    `Unable to locate ${appIdentifier} declaration after analysis`,
  );
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

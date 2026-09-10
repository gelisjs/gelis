import * as ts from "@typescript/typescript6";

import {
  analyzeAotSource,
  AotSourceUnsupportedError,
} from "./aot-source-analyzer";

const DEFAULT_HANDLER_IDENTIFIER = "__gelisAotHandlers";

export const AOT_MANAGED_INPUT_BINDINGS_IDENTIFIER = "__gelisAotInputBindings";

export const AOT_CAPTURE_MANAGED_INPUT_IDENTIFIER =
  "__gelisAotCaptureManagedInput";

const AOT_MANAGED_INPUT_BINDINGS_LOCAL_IDENTIFIER = "__gI";

const AOT_CAPTURE_MANAGED_INPUT_LOCAL_IDENTIFIER = "__gC";

export interface AotSourceRewrite {
  readonly code: string;

  readonly handlerArrayIdentifier: string;

  readonly managedInputBindingsIdentifier: string | undefined;

  readonly captureManagedInputIdentifier: string | undefined;

  readonly routeCount: number;
}

export interface AotSourceInsertion {
  readonly offset: number;

  readonly text: string;
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

  insertions: readonly AotSourceInsertion[] = [],
): AotSourceRewrite {
  const analysis = analyzeAotSource(sourceText, fileName, appIdentifier);

  if (analysis.routes.length === 0) {
    return {
      code: sourceText,

      handlerArrayIdentifier,

      managedInputBindingsIdentifier: undefined,

      captureManagedInputIdentifier: undefined,

      routeCount: 0,
    };
  }

  assertIdentifierAvailable(sourceText, fileName, handlerArrayIdentifier);

  const hasManagedInput = analysis.routes.some(
    (route) => route.optionsStart !== undefined,
  );

  if (hasManagedInput) {
    assertIdentifierAvailable(
      sourceText,
      fileName,
      AOT_MANAGED_INPUT_BINDINGS_IDENTIFIER,
    );

    assertIdentifierAvailable(
      sourceText,
      fileName,
      AOT_CAPTURE_MANAGED_INPUT_IDENTIFIER,
    );

    assertIdentifierAvailable(
      sourceText,
      fileName,
      AOT_MANAGED_INPUT_BINDINGS_LOCAL_IDENTIFIER,
    );

    assertIdentifierAvailable(
      sourceText,
      fileName,
      AOT_CAPTURE_MANAGED_INPUT_LOCAL_IDENTIFIER,
    );
  }

  const appDeclarationEnd = findAppDeclarationEnd(
    sourceText,
    fileName,
    appIdentifier,
  );

  const edits: SourceEdit[] = [];

  for (const insertion of insertions) {
    if (
      !Number.isInteger(insertion.offset) ||
      insertion.offset < 0 ||
      insertion.offset > sourceText.length
    ) {
      throw new Error(
        `Invalid AOT source insertion offset: ${insertion.offset}`,
      );
    }

    edits.push({
      start: insertion.offset,

      end: insertion.offset,

      text: insertion.text,
    });
  }

  let bindingDeclaration = `\n\nconst ${handlerArrayIdentifier} = new Array(${analysis.routes.length});`;

  if (hasManagedInput) {
    bindingDeclaration +=
      `\nconst ${AOT_MANAGED_INPUT_BINDINGS_IDENTIFIER} = ` +
      `new Array(${analysis.routes.length});` +
      `\nconst ${AOT_MANAGED_INPUT_BINDINGS_LOCAL_IDENTIFIER} = ` +
      `${AOT_MANAGED_INPUT_BINDINGS_IDENTIFIER};` +
      `\nconst ${AOT_CAPTURE_MANAGED_INPUT_LOCAL_IDENTIFIER} = ` +
      `${AOT_CAPTURE_MANAGED_INPUT_IDENTIFIER};`;
  }

  edits.push({
    start: appDeclarationEnd,

    end: appDeclarationEnd,

    text: bindingDeclaration,
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

    let replacement: string;

    if (route.optionsStart === undefined || route.optionsEnd === undefined) {
      replacement = `${handlerArrayIdentifier}[${index}] = ${handlerSource};`;
    } else {
      const optionsSource = sourceText.slice(
        route.optionsStart,
        route.optionsEnd,
      );

      replacement =
        `${AOT_MANAGED_INPUT_BINDINGS_LOCAL_IDENTIFIER}[${index}] = ` +
        `${AOT_CAPTURE_MANAGED_INPUT_LOCAL_IDENTIFIER}(` +
        `${optionsSource}, ${handlerSource});`;
    }

    edits.push({
      start: route.statementStart,

      end: route.statementEnd,

      text: replacement,
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

    managedInputBindingsIdentifier: hasManagedInput
      ? AOT_MANAGED_INPUT_BINDINGS_IDENTIFIER
      : undefined,

    captureManagedInputIdentifier: hasManagedInput
      ? AOT_CAPTURE_MANAGED_INPUT_IDENTIFIER
      : undefined,

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

import * as ts from "@typescript/typescript6";

import type { HttpMethod } from "../route";

export interface AotSourceRoute {
  readonly method: HttpMethod;

  readonly path: string;

  readonly handlerText: string;

  readonly statementStart: number;

  readonly statementEnd: number;

  readonly handlerStart: number;

  readonly handlerEnd: number;
}

export interface AotSourceAnalysis {
  readonly appIdentifier: string;

  readonly routes: readonly AotSourceRoute[];
}

export class AotSourceUnsupportedError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "AotSourceUnsupportedError";
  }
}

export function analyzeAotSource(
  sourceText: string,

  fileName = "application.ts",

  appIdentifier = "app",
): AotSourceAnalysis {
  const sourceFile = ts.createSourceFile(
    fileName,

    sourceText,

    ts.ScriptTarget.Latest,

    true,

    scriptKindFor(fileName),
  );

  assertCanonicalAppDeclaration(sourceFile, appIdentifier);

  const routes: AotSourceRoute[] = [];

  visit(sourceFile);

  return {
    appIdentifier,

    routes,
  };

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const routeCall = inspectRouteCall(
        node,

        appIdentifier,
      );

      if (routeCall !== undefined) {
        if (routeCall.computed) {
          throw unsupported(
            sourceFile,

            node,

            "computed route method access is not supported",
          );
        }

        const statement = node.parent;

        if (
          !ts.isExpressionStatement(statement) ||
          statement.parent !== sourceFile
        ) {
          throw unsupported(
            sourceFile,

            node,

            "route registration must be a top-level expression statement",
          );
        }

        if (node.arguments.length !== 2) {
          throw unsupported(
            sourceFile,

            node,

            "AOT v0.1 supports only plain path + handler routes",
          );
        }

        const pathArgument = node.arguments[0];

        const handlerArgument = node.arguments[1];

        if (pathArgument === undefined || handlerArgument === undefined) {
          throw unsupported(
            sourceFile,

            node,

            "route arguments are incomplete",
          );
        }

        if (!ts.isStringLiteralLike(pathArgument)) {
          throw unsupported(
            sourceFile,

            pathArgument,

            "route path must be a static string literal",
          );
        }

        if (ts.isSpreadElement(handlerArgument)) {
          throw unsupported(
            sourceFile,

            handlerArgument,

            "spread handler expressions are not supported",
          );
        }

        routes.push({
          method: routeCall.method,

          path: pathArgument.text,

          handlerText: handlerArgument.getText(sourceFile),

          statementStart: statement.getStart(sourceFile),

          statementEnd: statement.getEnd(),

          handlerStart: handlerArgument.getStart(sourceFile),

          handlerEnd: handlerArgument.getEnd(),
        });
      }
    }

    ts.forEachChild(node, visit);
  }
}

interface RouteCallInfo {
  readonly method: HttpMethod;

  readonly computed: boolean;
}

function inspectRouteCall(
  call: ts.CallExpression,

  appIdentifier: string,
): RouteCallInfo | undefined {
  const expression = call.expression;

  if (ts.isPropertyAccessExpression(expression)) {
    if (
      !ts.isIdentifier(expression.expression) ||
      expression.expression.text !== appIdentifier
    ) {
      return undefined;
    }

    const method = routeMethod(expression.name.text);

    if (method === undefined) {
      return undefined;
    }

    return {
      method,

      computed: false,
    };
  }

  if (ts.isElementAccessExpression(expression)) {
    if (
      !ts.isIdentifier(expression.expression) ||
      expression.expression.text !== appIdentifier
    ) {
      return undefined;
    }

    const argument = expression.argumentExpression;

    if (argument === undefined || !ts.isStringLiteralLike(argument)) {
      return undefined;
    }

    const method = routeMethod(argument.text);

    if (method === undefined) {
      return undefined;
    }

    return {
      method,

      computed: true,
    };
  }

  return undefined;
}

function assertCanonicalAppDeclaration(
  sourceFile: ts.SourceFile,

  appIdentifier: string,
): void {
  let found = false;

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    const isConst =
      (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;

    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== appIdentifier
      ) {
        continue;
      }

      if (found) {
        throw unsupported(
          sourceFile,

          declaration,

          `multiple ${appIdentifier} declarations are not supported`,
        );
      }

      found = true;

      if (!isConst) {
        throw unsupported(
          sourceFile,

          declaration,

          `${appIdentifier} must be declared with const`,
        );
      }

      const initializer = declaration.initializer;

      if (
        initializer === undefined ||
        !ts.isNewExpression(initializer) ||
        !ts.isIdentifier(initializer.expression) ||
        initializer.expression.text !== "Gelis"
      ) {
        throw unsupported(
          sourceFile,

          declaration,

          `${appIdentifier} must be initialized directly with new Gelis()`,
        );
      }
    }
  }

  if (!found) {
    throw new AotSourceUnsupportedError(
      `Missing canonical const ${appIdentifier} = new Gelis() declaration`,
    );
  }
}

function routeMethod(method: string): HttpMethod | undefined {
  switch (method) {
    case "get":
      return "GET";

    case "post":
      return "POST";

    case "put":
      return "PUT";

    case "patch":
      return "PATCH";

    case "delete":
      return "DELETE";

    case "options":
      return "OPTIONS";

    case "head":
      return "HEAD";

    default:
      return undefined;
  }
}

function unsupported(
  sourceFile: ts.SourceFile,

  node: ts.Node,

  reason: string,
): AotSourceUnsupportedError {
  const position = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );

  return new AotSourceUnsupportedError(
    `${sourceFile.fileName}:${position.line + 1}:${position.character + 1}: ${reason}`,
  );
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

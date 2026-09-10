import * as ts from "@typescript/typescript6";

import { ALL_ROUTE_METHOD, assertHttpMethodToken } from "../http-method";

const MANAGED_BODY_OPTION_KEYS = new Set([
  "query",
  "body",
  "bodyParser",
  "bodyContentTypes",
  "bodyLimit",
  "openapi",
]);

export interface AotSourceRoute {
  readonly method: string;

  readonly path: string;

  readonly handlerText: string;

  readonly statementStart: number;

  readonly statementEnd: number;

  readonly handlerStart: number;

  readonly handlerEnd: number;

  readonly optionsStart: number | undefined;

  readonly optionsEnd: number | undefined;
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

        let method: string;

        let pathArgument: ts.Expression | undefined;

        let optionsArgument: ts.Expression | undefined;

        let handlerArgument: ts.Expression | undefined;

        if (routeCall.kind === "generic") {
          if (node.arguments.length !== 3 && node.arguments.length !== 4) {
            throw unsupported(
              sourceFile,

              node,

              "AOT v0.1 supports only static method + path + handler routes for app.route()",
            );
          }

          const methodArgument = node.arguments[0];

          pathArgument = node.arguments[1];

          if (node.arguments.length === 3) {
            handlerArgument = node.arguments[2];
          } else {
            optionsArgument = node.arguments[2];
            handlerArgument = node.arguments[3];
          }

          if (
            methodArgument === undefined ||
            pathArgument === undefined ||
            handlerArgument === undefined
          ) {
            throw unsupported(
              sourceFile,

              node,

              "route arguments are incomplete",
            );
          }

          if (!ts.isStringLiteralLike(methodArgument)) {
            throw unsupported(
              sourceFile,

              methodArgument,

              "route method must be a static string literal",
            );
          }

          method = methodArgument.text;

          assertAotHttpMethod(
            sourceFile,

            methodArgument,

            method,
          );
        } else {
          if (node.arguments.length !== 2 && node.arguments.length !== 3) {
            throw unsupported(
              sourceFile,

              node,

              "AOT v0.1 supports only plain path + handler routes",
            );
          }

          pathArgument = node.arguments[0];

          if (node.arguments.length === 2) {
            handlerArgument = node.arguments[1];
          } else {
            optionsArgument = node.arguments[1];
            handlerArgument = node.arguments[2];
          }

          if (pathArgument === undefined || handlerArgument === undefined) {
            throw unsupported(
              sourceFile,

              node,

              "route arguments are incomplete",
            );
          }

          method = routeCall.method;
        }

        if (!ts.isStringLiteralLike(pathArgument)) {
          throw unsupported(
            sourceFile,

            pathArgument,

            "route path must be a static string literal",
          );
        }

        if (optionsArgument !== undefined) {
          assertManagedBodyOptions(
            sourceFile,

            optionsArgument,

            routeCall.kind,
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
          method,

          path: pathArgument.text,

          handlerText: handlerArgument.getText(sourceFile),

          statementStart: statement.getStart(sourceFile),

          statementEnd: statement.getEnd(),

          handlerStart: handlerArgument.getStart(sourceFile),

          handlerEnd: handlerArgument.getEnd(),

          optionsStart: optionsArgument?.getStart(sourceFile),

          optionsEnd: optionsArgument?.getEnd(),
        });
      }
    }

    ts.forEachChild(node, visit);
  }
}

interface ConvenienceRouteCallInfo {
  readonly kind: "convenience";

  readonly method: string;

  readonly computed: boolean;
}

interface GenericRouteCallInfo {
  readonly kind: "generic";

  readonly computed: boolean;
}

type RouteCallInfo = ConvenienceRouteCallInfo | GenericRouteCallInfo;

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

    return routeCallInfo(
      expression.name.text,

      false,
    );
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

    return routeCallInfo(
      argument.text,

      true,
    );
  }

  return undefined;
}

function routeCallInfo(
  methodName: string,

  computed: boolean,
): RouteCallInfo | undefined {
  if (methodName === "route") {
    return {
      kind: "generic",

      computed,
    };
  }

  const method = routeMethod(methodName);

  if (method === undefined) {
    return undefined;
  }

  return {
    kind: "convenience",

    method,

    computed,
  };
}

function assertManagedBodyOptions(
  sourceFile: ts.SourceFile,

  options: ts.Expression,

  routeKind: RouteCallInfo["kind"],
): void {
  const legacyPrefix =
    routeKind === "generic"
      ? "AOT v0.1 supports only static method + path + handler routes for app.route()"
      : "AOT v0.1 supports only plain path + handler routes";

  if (!ts.isObjectLiteralExpression(options)) {
    throw unsupported(
      sourceFile,

      options,

      `${legacyPrefix}; managed request-body AOT options must be a directly analyzable object literal`,
    );
  }

  let hasBody = false;

  for (const property of options.properties) {
    if (ts.isSpreadAssignment(property)) {
      throw unsupported(
        sourceFile,

        property,

        "managed request-body AOT options do not support spread properties",
      );
    }

    if (
      !ts.isPropertyAssignment(property) &&
      !ts.isShorthandPropertyAssignment(property)
    ) {
      throw unsupported(
        sourceFile,

        property,

        "managed request-body AOT options require ordinary static properties",
      );
    }

    const name = staticPropertyName(property.name);

    if (name === undefined) {
      throw unsupported(
        sourceFile,

        property.name,

        "managed request-body AOT options do not support computed property names",
      );
    }

    if (!MANAGED_BODY_OPTION_KEYS.has(name)) {
      throw unsupported(
        sourceFile,

        property.name,

        `${legacyPrefix}; managed request-body AOT option ${JSON.stringify(name)} is not supported`,
      );
    }

    if (name === "body") {
      hasBody = true;
    }
  }

  if (!hasBody) {
    throw unsupported(
      sourceFile,

      options,

      `${legacyPrefix}; managed request-body AOT options require a body property`,
    );
  }
}

function staticPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) {
    return name.text;
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

function routeMethod(method: string): string | undefined {
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

    case "query":
      return "QUERY";

    case "all":
      return ALL_ROUTE_METHOD;

    default:
      return undefined;
  }
}

function assertAotHttpMethod(
  sourceFile: ts.SourceFile,

  node: ts.Node,

  method: string,
): void {
  try {
    assertHttpMethodToken(method);
  } catch (error) {
    if (error instanceof Error) {
      throw unsupported(
        sourceFile,

        node,

        error.message,
      );
    }

    throw error;
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

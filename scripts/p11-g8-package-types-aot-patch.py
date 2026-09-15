from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing {label} anchor:\n{old}")
    return text.replace(old, new, 1)


# Package subpath exports.
path = Path("package.json")
text = path.read_text()
text = replace_once(
    text,
    '''    "./secure-headers": {\n      "types": "./src/secure-headers/index.ts",\n      "import": "./src/secure-headers/index.ts",\n      "default": "./src/secure-headers/index.ts"\n    }\n''',
    '''    "./secure-headers": {\n      "types": "./src/secure-headers/index.ts",\n      "import": "./src/secure-headers/index.ts",\n      "default": "./src/secure-headers/index.ts"\n    },\n    "./request-id": {\n      "types": "./src/request-id/index.ts",\n      "import": "./src/request-id/index.ts",\n      "default": "./src/request-id/index.ts"\n    },\n    "./timeout": {\n      "types": "./src/timeout/index.ts",\n      "import": "./src/timeout/index.ts",\n      "default": "./src/timeout/index.ts"\n    }\n''',
    "package exports",
)
path.write_text(text)


# Source AOT analyzer: permit only a canonical timeout policy expression.
path = Path("src/tooling/aot-source-analyzer.ts")
text = path.read_text()
text = replace_once(
    text,
    '''  "bodyLimit",\n  "openapi",\n]);\n''',
    '''  "bodyLimit",\n  "openapi",\n  "timeout",\n]);\n''',
    "AOT option key",
)
text = replace_once(
    text,
    '''  let hasBody = false;\n\n  for (const property of options.properties) {\n''',
    '''  let hasBody = false;\n  let hasManagedBodyOption = false;\n  let hasTimeout = false;\n\n  for (const property of options.properties) {\n''',
    "AOT option state",
)
text = replace_once(
    text,
    '''    if (name === "body") {\n      hasBody = true;\n    }\n  }\n\n  if (!hasBody) {\n    throw unsupported(\n      sourceFile,\n\n      options,\n\n      `${legacyPrefix}; managed request-body AOT options require a body property`,\n    );\n  }\n}\n\nfunction staticPropertyName(name: ts.PropertyName): string | undefined {\n''',
    '''    if (name === "timeout") {\n      if (hasTimeout) {\n        throw unsupported(\n          sourceFile,\n          property,\n          "route timeout AOT option must be declared exactly once",\n        );\n      }\n\n      assertCanonicalRouteTimeoutOption(sourceFile, property);\n      hasTimeout = true;\n      continue;\n    }\n\n    hasManagedBodyOption = true;\n\n    if (name === "body") {\n      hasBody = true;\n    }\n  }\n\n  if (hasManagedBodyOption && !hasBody) {\n    throw unsupported(\n      sourceFile,\n\n      options,\n\n      `${legacyPrefix}; managed request-body AOT options require a body property`,\n    );\n  }\n\n  if (!hasManagedBodyOption && !hasTimeout) {\n    throw unsupported(\n      sourceFile,\n      options,\n      `${legacyPrefix}; AOT route options require a managed body or canonical route timeout`,\n    );\n  }\n}\n\nfunction assertCanonicalRouteTimeoutOption(\n  sourceFile: ts.SourceFile,\n  property: ts.ObjectLiteralElementLike,\n): void {\n  if (!ts.isPropertyAssignment(property)) {\n    throw unsupported(\n      sourceFile,\n      property,\n      "route timeout AOT option must be a direct capability.route(<duration>) call",\n    );\n  }\n\n  const initializer = property.initializer;\n\n  if (\n    !ts.isCallExpression(initializer) ||\n    initializer.arguments.length !== 1 ||\n    !ts.isPropertyAccessExpression(initializer.expression) ||\n    initializer.expression.name.text !== "route" ||\n    !ts.isIdentifier(initializer.expression.expression)\n  ) {\n    throw unsupported(\n      sourceFile,\n      initializer,\n      "route timeout AOT option must be a direct capability.route(<duration>) call",\n    );\n  }\n\n  const duration = initializer.arguments[0];\n\n  if (duration === undefined || !ts.isNumericLiteral(duration)) {\n    throw unsupported(\n      sourceFile,\n      initializer,\n      "route timeout AOT duration must be a positive safe integer literal",\n    );\n  }\n\n  const value = Number(duration.text);\n\n  if (!Number.isSafeInteger(value) || value <= 0) {\n    throw unsupported(\n      sourceFile,\n      duration,\n      "route timeout AOT duration must be a positive safe integer literal",\n    );\n  }\n}\n\nfunction staticPropertyName(name: ts.PropertyName): string | undefined {\n''',
    "canonical route timeout analyzer",
)
path.write_text(text)


# Flat AOT option binding: managed body remains supported, timeout-only gains a boundary sidecar.
path = Path("src/runtime/flat-aot-managed-input.ts")
text = path.read_text()
text = replace_once(
    text,
    '''import { createRuntimeInputPlan } from "./input";\n\nimport type { RuntimeInputPlan } from "./input";\n\nimport { RUNTIME_ROUTE_INPUT, RUNTIME_ROUTE_PLAIN } from "./types";\n''',
    '''import { createRuntimeInputPlan } from "./input";\n\nimport type { RuntimeInputPlan } from "./input";\n\nimport { resolveRuntimeRouteExecutionBoundary } from "./route-boundary";\n\nimport type { RuntimeRouteExecutionBoundary } from "./route-boundary";\n\nimport {\n  RUNTIME_ROUTE_EXECUTION_BOUNDARY,\n  RUNTIME_ROUTE_INPUT,\n  RUNTIME_ROUTE_PLAIN,\n} from "./types";\n''',
    "flat AOT boundary imports",
)
text = replace_once(
    text,
    '''export interface FlatAotManagedInputBinding {\n  readonly handler: RuntimeRouteHandler;\n\n  readonly input: RuntimeInputPlan;\n\n  readonly contractMetadata: RuntimeRouteContractMetadata | undefined;\n}\n''',
    '''export interface FlatAotManagedInputBinding {\n  readonly handler: RuntimeRouteHandler;\n\n  readonly input: RuntimeInputPlan | undefined;\n\n  readonly executionBoundary: RuntimeRouteExecutionBoundary | undefined;\n\n  readonly contractMetadata: RuntimeRouteContractMetadata | undefined;\n}\n''',
    "flat AOT binding shape",
)
text = replace_once(
    text,
    '''  const input = createRuntimeInputPlan(options);\n\n  if (input === undefined || input.body === undefined) {\n    throw new TypeError(\n      "Gelis managed request-body AOT requires a body schema",\n    );\n  }\n\n  return {\n    handler,\n\n    input,\n\n    contractMetadata: createRuntimeRouteContractMetadata(options.openapi),\n  };\n''',
    '''  const input = createRuntimeInputPlan(options);\n  const executionBoundary = resolveRuntimeRouteExecutionBoundary(\n    options.timeout,\n  );\n\n  if (input !== undefined && input.body === undefined) {\n    throw new TypeError(\n      "Gelis managed request-body AOT requires a body schema",\n    );\n  }\n\n  if (input === undefined && executionBoundary === undefined) {\n    throw new TypeError(\n      "Gelis AOT route options require a managed body schema or execution boundary",\n    );\n  }\n\n  return {\n    handler,\n\n    input,\n\n    executionBoundary,\n\n    contractMetadata: createRuntimeRouteContractMetadata(options.openapi),\n  };\n''',
    "flat AOT capture",
)
text = replace_once(
    text,
    '''    const route: RuntimeRouteRecord = {\n      method: methodName,\n      path,\n      handler: inputBinding.handler,\n      flags: RUNTIME_ROUTE_INPUT,\n      input: inputBinding.input,\n      beforeHandle: undefined,\n      afterHandle: undefined,\n      responses: undefined,\n    };\n''',
    '''    const input = inputBinding.input;\n    const executionBoundary = inputBinding.executionBoundary;\n    let flags = RUNTIME_ROUTE_PLAIN;\n\n    if (input !== undefined) {\n      flags |= RUNTIME_ROUTE_INPUT;\n    }\n\n    if (executionBoundary !== undefined) {\n      flags |= RUNTIME_ROUTE_EXECUTION_BOUNDARY;\n    }\n\n    const route: RuntimeRouteRecord = {\n      method: methodName,\n      path,\n      handler: inputBinding.handler,\n      flags,\n      input,\n      ...(executionBoundary === undefined ? {} : { executionBoundary }),\n      beforeHandle: undefined,\n      afterHandle: undefined,\n      responses: undefined,\n    };\n''',
    "flat AOT route binding",
)
path.write_text(text)


# Existing body-limit assertion now acknowledges the generalized optional input sidecar.
path = Path("test/runtime/body-limit-aot.test.ts")
text = path.read_text()
text = replace_once(
    text,
    "    expect(binding?.input.bodyLimit).toBe(5);\n",
    "    expect(binding?.input?.bodyLimit).toBe(5);\n",
    "body-limit optional AOT input",
)
text = replace_once(
    text,
    "    expect(fixture.inputBindings[0]?.input.bodyLimit).toBe(3);\n",
    "    expect(fixture.inputBindings[0]?.input?.bodyLimit).toBe(3);\n",
    "body-limit optional AOT route input",
)
path.write_text(text)


# Package runtime export checks.
path = Path("test/package/package-exports.test.ts")
text = path.read_text()
text = replace_once(
    text,
    '''import { cors } from "gelis/cors";\nimport { secureHeaders } from "gelis/secure-headers";\n''',
    '''import { cors } from "gelis/cors";\nimport { requestId } from "gelis/request-id";\nimport { secureHeaders } from "gelis/secure-headers";\nimport { GelisTimeoutError, timeout } from "gelis/timeout";\n''',
    "package subpath imports",
)
text = replace_once(
    text,
    '''  test("does not expose Bun adapter APIs from the portable root", async () => {\n''',
    '''  test("resolves the portable request-ID subpath", () => {\n    const ids = requestId({ generator: () => "package-id" });\n    const app = new Gelis();\n\n    app.use(ids);\n\n    expect(ids.header).toBe("X-Request-Id");\n    expect(app).toBeInstanceOf(Gelis);\n  });\n\n  test("resolves the portable timeout subpath", () => {\n    const deadlines = timeout({ duration: 1_000 });\n    const routeDeadline = deadlines.route(500);\n    const app = new Gelis();\n\n    app.use(deadlines);\n    app.get("/timed", { timeout: routeDeadline }, () => "ok");\n\n    const error = new GelisTimeoutError(500, "route");\n    expect(error.duration).toBe(500);\n    expect(error.source).toBe("route");\n    expect(app).toBeInstanceOf(Gelis);\n  });\n\n  test("does not expose Bun adapter APIs from the portable root", async () => {\n''',
    "package subpath tests",
)
text = replace_once(
    text,
    '''  test("does not re-export secure-header helpers from the portable root", async () => {\n    const root = await import("gelis");\n\n    expect("secureHeaders" in root).toBe(false);\n  });\n});\n''',
    '''  test("does not re-export secure-header helpers from the portable root", async () => {\n    const root = await import("gelis");\n\n    expect("secureHeaders" in root).toBe(false);\n  });\n\n  test("does not re-export request-ID or timeout convenience APIs from the portable root", async () => {\n    const root = await import("gelis");\n\n    expect("requestId" in root).toBe(false);\n    expect("timeout" in root).toBe(false);\n    expect("GelisTimeoutError" in root).toBe(false);\n  });\n});\n''',
    "root subpath isolation test",
)
path.write_text(text)


# Portable type consumer.
path = Path("test/package/portable/consumer.ts")
text = path.read_text()
text = replace_once(
    text,
    '''import { cors } from "gelis/cors";\nimport {\n  secureHeaders,\n''',
    '''import { cors } from "gelis/cors";\nimport {\n  requestId,\n  type RequestIdCapability,\n  type RequestIdGenerator,\n  type RequestIdOptions,\n  type RequestIdValidator,\n} from "gelis/request-id";\nimport {\n  secureHeaders,\n''',
    "portable request-ID import",
)
text = replace_once(
    text,
    '''} from "gelis/secure-headers";\n\nconst app = new Gelis();\n''',
    '''} from "gelis/secure-headers";\nimport {\n  GelisTimeoutError,\n  timeout,\n  type TimeoutCapability,\n  type TimeoutHandler,\n  type TimeoutOptions,\n  type TimeoutRoutePolicy,\n  type TimeoutSource,\n} from "gelis/timeout";\n\nconst app = new Gelis();\n\nconst requestIdGenerator: RequestIdGenerator = () => "portable-id";\nconst requestIdValidator: RequestIdValidator = (value, request) => {\n  request.headers.get("x-request-id");\n  return value.startsWith("edge-");\n};\nconst requestIdOptions: RequestIdOptions = {\n  generator: requestIdGenerator,\n  acceptIncoming: requestIdValidator,\n};\nconst ids: RequestIdCapability = requestId(requestIdOptions);\napp.use(ids);\n\nconst timeoutHandler: TimeoutHandler = (_request, error) => {\n  const source: TimeoutSource = error.source;\n  void source;\n  return new Response(error.message, { status: 503 });\n};\nconst timeoutOptions: TimeoutOptions = {\n  duration: 1_000,\n  onTimeout: timeoutHandler,\n};\nconst deadlines: TimeoutCapability = timeout(timeoutOptions);\nconst routeDeadline: TimeoutRoutePolicy = deadlines.route(500);\napp.use(deadlines);\napp.get("/timed", { timeout: routeDeadline }, () => "timed");\n\nconst timeoutError = new GelisTimeoutError(500, "route");\ntimeoutError.duration;\ntimeoutError.source;\n\n// @ts-expect-error duration must be numeric.\ntimeout({ duration: "1000" });\n// @ts-expect-error route duration must be numeric.\ndeadlines.route("500");\n// @ts-expect-error route timeout must be an opaque timeout policy.\napp.get("/invalid-timeout", { timeout: 500 }, () => "invalid");\n// @ts-expect-error request-ID header must be a string.\nrequestId({ header: 123 });\n''',
    "portable timeout surface",
)
text = replace_once(
    text,
    '''// Portable consumers must not receive Bun globals through `gelis`,\n// `gelis/cookie`, `gelis/cors`, `gelis/body-limit`, or `gelis/secure-headers`.\n''',
    '''// Portable consumers must not receive Bun globals through `gelis` or any\n// portable Gelis subpath, including request-ID and timeout capabilities.\n''',
    "portable Bun comment",
)
path.write_text(text)

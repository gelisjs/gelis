from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing {label} anchor:\n{old}")
    return text.replace(old, new, 1)


# Public route option type: type-only dependency, no runtime timeout import.
route_path = Path("src/route.ts")
route = route_path.read_text()
route = replace_once(
    route,
    'import type { StandardSchemaV1 } from "./schema";\n',
    'import type { StandardSchemaV1 } from "./schema";\n\nimport type { TimeoutRoutePolicy } from "./timeout/route-policy";\n',
    "route timeout type import",
)
route = route.replace(
    '  readonly bodyLimit?: number;\n\n  readonly responses?',
    '  readonly bodyLimit?: number;\n\n  readonly timeout?: TimeoutRoutePolicy;\n\n  readonly responses?',
)
if route.count('readonly timeout?: TimeoutRoutePolicy;') != 2:
    raise SystemExit("expected timeout option in RouteOptions and RouteOptionsFor")
route_path.write_text(route)

# Runtime record: timed routes alone receive the optional boundary property.
types_path = Path("src/runtime/types.ts")
types = types_path.read_text()
types = replace_once(
    types,
    'import type { RuntimeResponsePlan } from "./response-plan";\n',
    'import type { RuntimeResponsePlan } from "./response-plan";\n\nimport type { RuntimeRouteExecutionBoundary } from "./route-boundary";\n',
    "runtime boundary type import",
)
types = replace_once(
    types,
    'export const RUNTIME_ROUTE_MODULE_REQUEST_SCOPE = 32;\n',
    'export const RUNTIME_ROUTE_MODULE_REQUEST_SCOPE = 32;\n\nexport const RUNTIME_ROUTE_EXECUTION_BOUNDARY = 64;\n',
    "runtime boundary flag",
)
types = replace_once(
    types,
    '  readonly moduleScope?: object;\n\n  beforeHandle: RuntimeBeforeHandle | undefined;\n',
    '  readonly moduleScope?: object;\n\n  /*\n   * Present only on routes carrying an opt-in execution boundary.\n   * Plain and untimed routes deliberately omit this property.\n   */\n  readonly executionBoundary?: RuntimeRouteExecutionBoundary;\n\n  beforeHandle: RuntimeBeforeHandle | undefined;\n',
    "runtime boundary property",
)
types_path.write_text(types)

# Route registration resolves the generic boundary protocol only when the
# timeout option is explicitly present.
builder_path = Path("src/route-builder.ts")
builder = builder_path.read_text()
builder = replace_once(
    builder,
    'import { createRuntimeInputPlan } from "./runtime/input";\n',
    'import { createRuntimeInputPlan } from "./runtime/input";\n\nimport { resolveRuntimeRouteExecutionBoundary } from "./runtime/route-boundary";\n',
    "route builder boundary import",
)
builder = replace_once(
    builder,
    '  RUNTIME_ROUTE_BEFORE_HANDLE,\n  RUNTIME_ROUTE_INPUT,\n  RUNTIME_ROUTE_RESPONSE,\n',
    '  RUNTIME_ROUTE_BEFORE_HANDLE,\n  RUNTIME_ROUTE_EXECUTION_BOUNDARY,\n  RUNTIME_ROUTE_INPUT,\n  RUNTIME_ROUTE_RESPONSE,\n',
    "route builder boundary flag import",
)
builder = replace_once(
    builder,
    '    const afterHandle = lifecycle?.afterHandle;\n\n    let flags = 0;\n',
    '    const afterHandle = lifecycle?.afterHandle;\n\n    const executionBoundary =\n      options?.timeout === undefined\n        ? undefined\n        : resolveRuntimeRouteExecutionBoundary(options.timeout);\n\n    let flags = 0;\n',
    "route builder boundary resolution",
)
builder = replace_once(
    builder,
    '    if (responsePlan !== undefined) {\n      flags |= RUNTIME_ROUTE_RESPONSE;\n    }\n\n    const runtimeRoute: RuntimeRouteRecord = {\n',
    '    if (responsePlan !== undefined) {\n      flags |= RUNTIME_ROUTE_RESPONSE;\n    }\n\n    if (executionBoundary !== undefined) {\n      flags |= RUNTIME_ROUTE_EXECUTION_BOUNDARY;\n    }\n\n    const runtimeRoute: RuntimeRouteRecord = {\n',
    "route builder boundary flag assignment",
)
builder = replace_once(
    builder,
    '    if (contractMetadata !== undefined) {\n',
    '    if (executionBoundary !== undefined) {\n      Object.defineProperty(runtimeRoute, "executionBoundary", {\n        enumerable: true,\n        value: executionBoundary,\n      });\n    }\n\n    if (contractMetadata !== undefined) {\n',
    "route builder boundary sidecar",
)
builder_path.write_text(builder)

# Application dispatch keeps the existing plain-route return ahead of every
# route-boundary lookup. Timed routes delegate to a duplicated non-boundary
# executor so all existing untimed execution shapes remain byte-for-byte in
# their current dispatch path.
app_path = Path("src/app.ts")
app = app_path.read_text()
app = replace_once(
    app,
    '  RUNTIME_ROUTE_BEFORE_HANDLE,\n  RUNTIME_ROUTE_RESPONSE,\n',
    '  RUNTIME_ROUTE_BEFORE_HANDLE,\n  RUNTIME_ROUTE_EXECUTION_BOUNDARY,\n  RUNTIME_ROUTE_RESPONSE,\n',
    "app boundary flag import",
)

response_marker = '''    /*\n     * Response-only routes are the second critical\n'''
start = app.find(response_marker)
if start == -1:
    raise SystemExit("missing app response-route block")

method_class_end = app.find('\n  }\n}\n\nfunction commitModuleRuntimeRoutesAtomic(', start)
if method_class_end == -1:
    raise SystemExit("missing Gelis.fetch/class end anchor")

execution_block = app[start:method_class_end]

boundary_dispatch = '''    if ((route.flags & RUNTIME_ROUTE_EXECUTION_BOUNDARY) !== 0) {\n      const boundary = route.executionBoundary;\n\n      if (boundary === undefined) {\n        throw new Error("Missing Gelis route execution boundary");\n      }\n\n      const flags = route.flags & ~RUNTIME_ROUTE_EXECUTION_BOUNDARY;\n\n      return boundary.run(request, () =>\n        invokeRuntimeRouteWithoutBoundary(\n          route,\n          request,\n          params,\n          flags,\n        ),\n      );\n    }\n\n'''
app = app[:start] + boundary_dispatch + app[start:]

# Re-find class-end after insertion and add a timed-only executor before the
# existing post-class helpers. The ordinary non-boundary dispatch remains
# untouched in Gelis.fetch().
insert_at = app.find('\nfunction commitModuleRuntimeRoutesAtomic(')
if insert_at == -1:
    raise SystemExit("missing helper insertion anchor")

helper_block = execution_block.replace('route.flags', 'flags')
plain_helper = '''function invokeRuntimeRouteWithoutBoundary(\n  route: RuntimeRouteRecord,\n  request: Request,\n  params: Record<string, string>,\n  flags: number,\n): Response | Promise<Response> {\n  if (flags === RUNTIME_ROUTE_PLAIN) {\n    const result = route.handler({\n      request,\n      params,\n      query: undefined,\n      body: undefined,\n      reply: runtimeReply,\n    });\n\n    if (isPromiseLike(result)) {\n      return Promise.resolve(result).then(normalizeResponse);\n    }\n\n    return normalizeResponse(result);\n  }\n\n'''
# execution_block is indented for a class method. Four-space indentation is
# valid inside this standalone helper and Prettier normalizes it later.
helper = plain_helper + helper_block + '\n}\n'
app = app[:insert_at] + '\n' + helper + app[insert_at:]

# Global lifecycle recompilation must preserve the opt-in boundary bit.
app = replace_once(
    app,
    '  if (route.responsePlan !== undefined) {\n    flags |= RUNTIME_ROUTE_RESPONSE;\n  }\n\n  route.flags = flags;\n',
    '  if (route.responsePlan !== undefined) {\n    flags |= RUNTIME_ROUTE_RESPONSE;\n  }\n\n  if (route.executionBoundary !== undefined) {\n    flags |= RUNTIME_ROUTE_EXECUTION_BOUNDARY;\n  }\n\n  route.flags = flags;\n',
    "lifecycle boundary preservation",
)
app_path.write_text(app)

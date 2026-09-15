from pathlib import Path

path = Path("src/route-builder.ts")
text = path.read_text()

import_anchor = 'import type { StandardSchemaV1 } from "./schema";\n'
if import_anchor not in text:
    raise SystemExit("missing StandardSchemaV1 import anchor")
text = text.replace(
    import_anchor,
    import_anchor + '\nimport type { TimeoutRoutePolicy } from "./timeout/route-policy";\n',
    1,
)

interface_anchor = '''interface RuntimeRouteLifecycle {\n  readonly beforeHandle?: RuntimeBeforeHandle;\n\n  readonly afterHandle?: RuntimeAfterHandle;\n}\n'''
interface_block = interface_anchor + '''\ninterface TimeoutOnlyRouteOptions {\n  readonly timeout: TimeoutRoutePolicy;\n\n  readonly query?: never;\n\n  readonly body?: never;\n\n  readonly bodyParser?: never;\n\n  readonly bodyContentTypes?: never;\n\n  readonly bodyLimit?: never;\n\n  readonly responses?: never;\n\n  readonly openapi?: never;\n}\n'''
if interface_anchor not in text:
    raise SystemExit("missing RuntimeRouteLifecycle anchor")
text = text.replace(interface_anchor, interface_block, 1)

methods = [
    ("get", "GET", "GET"),
    ("post", "POST", "POST"),
    ("put", "PUT", "PUT"),
    ("patch", "PATCH", "PATCH"),
    ("delete", "DELETE", "DELETE"),
    ("options", "OPTIONS", "OPTIONS"),
    ("head", "HEAD", "HEAD"),
    ("query", "QUERY", "QUERY"),
    ("all", "ALL", "*"),
]

for method, label, token in methods:
    marker = f'''  /*\n   * {label} with options but without an explicit\n   * response contract.\n   */\n'''
    if marker not in text:
        raise SystemExit(f"missing {label} generic options marker")

    overload = f'''  /*\n   * {label} with timeout-only execution policy.\n   *\n   * Keep timeout-only declarations on the same lightweight type path as\n   * plain routes instead of instantiating query/body/response conditionals.\n   */\n  {method}<const Path extends string, Result>(\n    path: Path & ValidRoutePath<Path>,\n\n    options: TimeoutOnlyRouteOptions,\n\n    handler: RouteHandler<JoinRoutePath<Prefix, Path>, never, never, Result>,\n\n    lifecycle?: RouteLifecycleFor<\n      JoinRoutePath<Prefix, Path>,\n      undefined,\n      undefined,\n      undefined,\n      Result\n    >,\n  ): RouteRef<\n    "{token}",\n    JoinRoutePath<Prefix, Path>,\n    RouteRequestContract<InferPathParams<JoinRoutePath<Prefix, Path>>>,\n    InferImplicitResponses<Result>\n  >;\n\n'''
    text = text.replace(marker, overload + marker, 1)

route_marker = '''  /*\n   * Generic method route with options but without\n   * an explicit response contract.\n   */\n'''
if route_marker not in text:
    raise SystemExit("missing generic route options marker")
route_overload = '''  /*\n   * Generic method route with timeout-only execution policy.\n   */\n  route<const Method extends string, const Path extends string, Result>(\n    method: Method & ValidHttpMethodLiteral<Method>,\n\n    path: Path & ValidRoutePath<Path>,\n\n    options: TimeoutOnlyRouteOptions,\n\n    handler: RouteHandler<JoinRoutePath<Prefix, Path>, never, never, Result>,\n\n    lifecycle?: RouteLifecycleFor<\n      JoinRoutePath<Prefix, Path>,\n      undefined,\n      undefined,\n      undefined,\n      Result\n    >,\n  ): RouteRef<\n    Method,\n    JoinRoutePath<Prefix, Path>,\n    RouteRequestContract<InferPathParams<JoinRoutePath<Prefix, Path>>>,\n    InferImplicitResponses<Result>\n  >;\n\n'''
text = text.replace(route_marker, route_overload + route_marker, 1)

path.write_text(text)

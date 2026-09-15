from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing {label} anchor:\n{old}")
    return text.replace(old, new, 1)


path = Path("src/app.ts")
text = path.read_text()

text = replace_once(
    text,
    "  routeIdentityKeys: Set<string> | undefined;\n\n  localBeforeHooks:",
    "  routeIdentityKeys: Set<string> | undefined;\n\n  /*\n   * Execution-boundary ownership is configuration metadata only.\n   * Allocate its registry lazily so applications without route boundaries\n   * pay no per-request cost and no per-route sidecar allocation.\n   */\n  routeBoundaryOwners: Map<symbol, object> | undefined;\n\n  localBeforeHooks:",
    "app state boundary owners",
)

text = replace_once(
    text,
    "      routeIdentityKeys: undefined,\n\n      localBeforeHooks:",
    "      routeIdentityKeys: undefined,\n\n      routeBoundaryOwners: undefined,\n\n      localBeforeHooks:",
    "constructor boundary owners",
)

text = replace_once(
    text,
    '''        applyRouteSpecializersToRoutes(state, routes);\n\n        state.router = router;\n\n        state.routes = routes;\n\n        state.routeIdentityKeys = undefined;\n''',
    '''        applyRouteSpecializersToRoutes(state, routes);\n        validateRouteExecutionBoundaryOwners(state, routes);\n\n        state.router = router;\n\n        state.routes = routes;\n\n        state.routeIdentityKeys = undefined;\n        commitRouteExecutionBoundaryOwners(state, routes);\n''',
    "prebuilt boundary owners",
)

old_validate_tail = '''    pending.add(key);\n  }\n}\n\nfunction ensureRouteIdentityKeys(state: AppRuntimeState): Set<string> {\n'''
new_validate_tail = '''    pending.add(key);\n  }\n\n  validateRouteExecutionBoundaryOwners(state, routes);\n}\n\nfunction validateRouteExecutionBoundaryOwners(\n  state: AppRuntimeState,\n  routes: readonly RuntimeRouteRecord[],\n): void {\n  if (routes.length === 0) {\n    return;\n  }\n\n  const existing = state.routeBoundaryOwners;\n  let pending: Map<symbol, object> | undefined;\n\n  for (let index = 0; index < routes.length; index++) {\n    const boundary = routes[index]!.executionBoundary;\n\n    if (boundary === undefined) {\n      continue;\n    }\n\n    const existingOwner = existing?.get(boundary.family);\n\n    if (existingOwner !== undefined && existingOwner !== boundary.owner) {\n      throw new Error(\n        "Gelis application cannot mix distinct route execution boundary owners",\n      );\n    }\n\n    const pendingOwner = pending?.get(boundary.family);\n\n    if (pendingOwner !== undefined && pendingOwner !== boundary.owner) {\n      throw new Error(\n        "Gelis application cannot mix distinct route execution boundary owners",\n      );\n    }\n\n    if (existingOwner === undefined && pendingOwner === undefined) {\n      pending ??= new Map<symbol, object>();\n      pending.set(boundary.family, boundary.owner);\n    }\n  }\n}\n\nfunction commitRouteExecutionBoundaryOwners(\n  state: AppRuntimeState,\n  routes: readonly RuntimeRouteRecord[],\n): void {\n  let owners = state.routeBoundaryOwners;\n\n  for (let index = 0; index < routes.length; index++) {\n    const boundary = routes[index]!.executionBoundary;\n\n    if (boundary === undefined) {\n      continue;\n    }\n\n    if (owners === undefined) {\n      owners = new Map<symbol, object>();\n      state.routeBoundaryOwners = owners;\n    }\n\n    owners.set(boundary.family, boundary.owner);\n  }\n}\n\nfunction ensureRouteIdentityKeys(state: AppRuntimeState): Set<string> {\n'''
text = replace_once(text, old_validate_tail, new_validate_tail, "boundary owner helpers")

text = replace_once(
    text,
    '''  if (state.routeSpecializers !== undefined) {\n    validatePluginCompositionRoutes(state, routes);\n    applyRouteSpecializersToRoutes(state, routes);\n  }\n\n  const localBeforeHooks = state.localBeforeHooks;\n''',
    '''  if (state.routeSpecializers !== undefined) {\n    validatePluginCompositionRoutes(state, routes);\n    applyRouteSpecializersToRoutes(state, routes);\n  } else {\n    validateRouteExecutionBoundaryOwners(state, routes);\n  }\n\n  const localBeforeHooks = state.localBeforeHooks;\n''',
    "module boundary prevalidation",
)

text = replace_once(
    text,
    '''    registerBatchAtomic.call(state.router, routes);\n\n    activateAllFallbackForRoutes(state, routes);\n''',
    '''    registerBatchAtomic.call(state.router, routes);\n    commitRouteExecutionBoundaryOwners(state, routes);\n\n    activateAllFallbackForRoutes(state, routes);\n''',
    "module plain boundary owner commit",
)

text = replace_once(
    text,
    '''  registerBatchAtomic.call(state.router, routes);\n\n  activateAllFallbackForRoutes(state, routes);\n''',
    '''  registerBatchAtomic.call(state.router, routes);\n  commitRouteExecutionBoundaryOwners(state, routes);\n\n  activateAllFallbackForRoutes(state, routes);\n''',
    "module lifecycle boundary owner commit",
)

text = replace_once(
    text,
    '''  applyRouteSpecializers(state, route);\n\n  /*\n   * Router registration happens before mutating\n''',
    '''  applyRouteSpecializers(state, route);\n  validateRouteExecutionBoundaryOwners(state, [route]);\n\n  /*\n   * Router registration happens before mutating\n''',
    "single route boundary validation",
)

text = replace_once(
    text,
    '''  state.router.register(route);\n\n  if (route.method === ALL_ROUTE_METHOD && state.router instanceof Router) {\n''',
    '''  state.router.register(route);\n  commitRouteExecutionBoundaryOwners(state, [route]);\n\n  if (route.method === ALL_ROUTE_METHOD && state.router instanceof Router) {\n''',
    "single route boundary commit",
)

path.write_text(text)

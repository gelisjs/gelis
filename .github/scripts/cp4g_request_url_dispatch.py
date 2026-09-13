from pathlib import Path

path = Path("src/app.ts")
text = path.read_text()

anchor = '''  matchingMethods(pathname: string): string[];\n}\n\ninterface AppRuntimeState {\n  router: GelisInternalRouter;\n'''
replacement = '''  matchingMethods(pathname: string): string[];\n}\n\ntype GelisRuntimeRouter = GelisInternalRouter & {\n  matchRequestUrl(\n    method: string,\n\n    url: string,\n  ): RuntimeRouteMatch | undefined;\n};\n\nfunction resolveRuntimeRouter(router: GelisInternalRouter): GelisRuntimeRouter {\n  if (router.matchRequestUrl !== undefined) {\n    return router as GelisRuntimeRouter;\n  }\n\n  const registerBatchAtomic = router.registerBatchAtomic;\n\n  return {\n    register: router.register.bind(router),\n\n    ...(registerBatchAtomic === undefined\n      ? {}\n      : { registerBatchAtomic: registerBatchAtomic.bind(router) }),\n\n    match: router.match.bind(router),\n\n    matchRequestUrl(method: string, url: string): RuntimeRouteMatch | undefined {\n      return router.match(method, pathnameFromRequestUrl(url));\n    },\n\n    matchingMethods: router.matchingMethods.bind(router),\n  };\n}\n\ninterface AppRuntimeState {\n  router: GelisRuntimeRouter;\n'''
if anchor not in text:
    raise SystemExit("runtime router type anchor not found")
text = text.replace(anchor, replacement, 1)

install_router = '''      installRouter(router: GelisInternalRouter): void {\n        state.router = router;\n      },\n'''
install_router_replacement = '''      installRouter(router: GelisInternalRouter): void {\n        state.router = resolveRuntimeRouter(router);\n      },\n'''
if install_router not in text:
    raise SystemExit("installRouter anchor not found")
text = text.replace(install_router, install_router_replacement, 1)

prebuilt = '''        state.router = router;\n\n        state.routes = routes;\n'''
prebuilt_replacement = '''        state.router = resolveRuntimeRouter(router);\n\n        state.routes = routes;\n'''
if prebuilt not in text:
    raise SystemExit("installPrebuiltRuntime anchor not found")
text = text.replace(prebuilt, prebuilt_replacement, 1)

old_fetch = '''    const router = this.#state.router;\n    const matchRequestUrl = router.matchRequestUrl;\n\n    let pathname: string | undefined;\n    let matched: RuntimeRouteMatch | undefined;\n\n    if (matchRequestUrl === undefined) {\n      pathname = pathnameFromRequestUrl(request.url);\n      matched = router.match(method, pathname);\n    } else {\n      matched = matchRequestUrl.call(router, method, request.url);\n\n      if (matched === undefined) {\n        matched = matchRequestUrl.call(router, ALL_ROUTE_METHOD, request.url);\n      }\n    }\n'''
new_fetch = '''    const router = this.#state.router;\n\n    let pathname: string | undefined;\n    let matched = router.matchRequestUrl(method, request.url);\n\n    if (matched === undefined) {\n      matched = router.matchRequestUrl(ALL_ROUTE_METHOD, request.url);\n    }\n'''
if old_fetch not in text:
    raise SystemExit("fetch dispatch anchor not found")
text = text.replace(old_fetch, new_fetch, 1)

path.write_text(text)

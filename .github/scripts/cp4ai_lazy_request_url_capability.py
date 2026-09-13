from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text(encoding="utf-8")

old_class = '''export class Router {
  #methods = new Map<string, MethodRoutes>();

  static fromMethods(methods: Map<string, MethodRoutes>): Router {
    const router = new Router();

    router.#methods = methods;

    return router;
  }

  register(route: RuntimeRouteRecord): void {
    const table = this.getOrCreateMethod(route.method);

    registerRouteIntoTable(table, route);
  }
'''
new_class = '''export class Router {
  #methods = new Map<string, MethodRoutes>();

  declare matchRequestUrl:
    | ((method: string, url: string) => RuntimeRouteMatch | undefined)
    | undefined;

  static fromMethods(methods: Map<string, MethodRoutes>): Router {
    const router = new Router();

    router.#methods = methods;

    if (methodsNeedRequestUrlMatching(methods)) {
      router.#activateRequestUrlMatching();
    }

    return router;
  }

  register(route: RuntimeRouteRecord): void {
    const table = this.getOrCreateMethod(route.method);

    if (registerRouteIntoTable(table, route)) {
      this.#activateRequestUrlMatching();
    }
  }
'''
if text.count(old_class) != 1:
    raise SystemExit(f"expected one Router class header, found {text.count(old_class)}")
text = text.replace(old_class, new_class, 1)

old_batch = '''    const nextMethods = new Map(this.#methods);

    const writableMethods = new Map<string, MethodRoutes>();

    for (const route of routes) {
'''
new_batch = '''    const nextMethods = new Map(this.#methods);

    const writableMethods = new Map<string, MethodRoutes>();
    let registeredDynamicRoute = false;

    for (const route of routes) {
'''
if text.count(old_batch) != 1:
    raise SystemExit(f"expected one batch header, found {text.count(old_batch)}")
text = text.replace(old_batch, new_batch, 1)

old_batch_register = '''      registerRouteIntoTable(table, route);
    }

    /*
     * No mutation of the active method map occurred
     * before this point.
     */
    this.#methods = nextMethods;
  }
'''
new_batch_register = '''      registeredDynamicRoute =
        registerRouteIntoTable(table, route) || registeredDynamicRoute;
    }

    /*
     * No mutation of the active method map occurred
     * before this point.
     */
    this.#methods = nextMethods;

    if (registeredDynamicRoute) {
      this.#activateRequestUrlMatching();
    }
  }
'''
if text.count(old_batch_register) != 1:
    raise SystemExit(
        f"expected one batch registration block, found {text.count(old_batch_register)}"
    )
text = text.replace(old_batch_register, new_batch_register, 1)

old_method = '''  matchRequestUrl(method: string, url: string): RuntimeRouteMatch | undefined {
'''
new_method = '''  #activateRequestUrlMatching(): void {
    if (this.matchRequestUrl === undefined) {
      this.matchRequestUrl = this.#matchRequestUrl;
    }
  }

  #matchRequestUrl(method: string, url: string): RuntimeRouteMatch | undefined {
'''
if text.count(old_method) != 1:
    raise SystemExit(f"expected one matchRequestUrl method, found {text.count(old_method)}")
text = text.replace(old_method, new_method, 1)

anchor = '''function createMethodRoutes(): MethodRoutes {
'''
helpers = '''function methodsNeedRequestUrlMatching(
  methods: Map<string, MethodRoutes>,
): boolean {
  for (const table of methods.values()) {
    if (methodTableNeedsRequestUrlMatching(table)) {
      return true;
    }
  }

  return false;
}

function methodTableNeedsRequestUrlMatching(table: MethodRoutes): boolean {
  return (
    table.usesDynamicTrie ||
    (table.trailingParamFingerprints !== undefined &&
      table.trailingParamFingerprints.size !== 0) ||
    (table.trailingParamRoutes !== undefined &&
      table.trailingParamRoutes.size !== 0)
  );
}

function createMethodRoutes(): MethodRoutes {
'''
if text.count(anchor) != 1:
    raise SystemExit(f"expected one createMethodRoutes anchor, found {text.count(anchor)}")
text = text.replace(anchor, helpers, 1)

old_signature = '''function registerRouteIntoTable(
  table: MethodRoutes,

  route: RuntimeRouteRecord,
): void {
'''
new_signature = '''function registerRouteIntoTable(
  table: MethodRoutes,

  route: RuntimeRouteRecord,
): boolean {
'''
if text.count(old_signature) != 1:
    raise SystemExit(
        f"expected one registerRouteIntoTable signature, found {text.count(old_signature)}"
    )
text = text.replace(old_signature, new_signature, 1)

replacements = [
    (
        '''    return;\n  }\n\n  const finalSegment = segments[segments.length - 1];\n''',
        '''    return false;\n  }\n\n  const finalSegment = segments[segments.length - 1];\n''',
        "static registration return",
    ),
    (
        '''        return;\n      }\n\n      const trailingParamRoutes = table.trailingParamRoutes;\n''',
        '''        return true;\n      }\n\n      const trailingParamRoutes = table.trailingParamRoutes;\n''',
        "fingerprint registration return",
    ),
    (
        '''        trailingParamRoutes.set(prefix, trailingRoute);\n\n        return;\n      }\n\n      if (!registerTrailingFingerprint(table, prefix, trailingRoute)) {\n''',
        '''        trailingParamRoutes.set(prefix, trailingRoute);\n\n        return true;\n      }\n\n      if (!registerTrailingFingerprint(table, prefix, trailingRoute)) {\n''',
        "trailing map registration return",
    ),
    (
        '''      if (!registerTrailingFingerprint(table, prefix, trailingRoute)) {\n        throw duplicateRoute(route);\n      }\n\n      return;\n    }\n  }\n''',
        '''      if (!registerTrailingFingerprint(table, prefix, trailingRoute)) {\n        throw duplicateRoute(route);\n      }\n\n      return true;\n    }\n  }\n''',
        "new trailing registration return",
    ),
    (
        '''  registerDynamicRoute(\n    table.dynamicRoot,\n\n    route,\n  );\n}\n\nfunction migrateTrailingRoutesToTrie(table: MethodRoutes): void {\n''',
        '''  registerDynamicRoute(\n    table.dynamicRoot,\n\n    route,\n  );\n\n  return true;\n}\n\nfunction migrateTrailingRoutesToTrie(table: MethodRoutes): void {\n''',
        "generic registration end",
    ),
]

for old, new, label in replacements:
    if text.count(old) != 1:
        raise SystemExit(f"expected one {label}, found {text.count(old)}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")

from pathlib import Path
import subprocess

BASE = "c18f231374d0008b7cc3e01bacbf9f81aff9a273"

router_path = Path("src/runtime/router.ts")
router = subprocess.check_output(
    ["git", "show", f"{BASE}:src/runtime/router.ts"], text=True
)

router = router.replace(
    "export class Router {\n  #methods = new Map<string, MethodRoutes>();\n\n  static fromMethods",
    '''export class Router {\n  #methods = new Map<string, MethodRoutes>();\n\n  constructor(requestUrlFastPathEnabled = true) {\n    if (!requestUrlFastPathEnabled) {\n      Object.defineProperty(this, "matchRequestUrl", {\n        configurable: true,\n        value: undefined,\n      });\n    }\n  }\n\n  static fromMethods''',
    1,
)

router = router.replace(
    "    registerRouteIntoTable(table, route);\n  }\n\n  /*\n   * Registers one composition batch transactionally.",
    '''    registerRouteIntoTable(table, route);\n\n    if (routePathHasParams(route.path)) {\n      this.enableRequestUrlFastPath();\n    }\n  }\n\n  /*\n   * Registers one composition batch transactionally.''',
    1,
)

router = router.replace(
    "    const writableMethods = new Map<string, MethodRoutes>();\n\n    for (const route of routes) {",
    '''    const writableMethods = new Map<string, MethodRoutes>();\n    let enableRequestUrlFastPath = false;\n\n    for (const route of routes) {''',
    1,
)

router = router.replace(
    "      registerRouteIntoTable(table, route);\n    }\n\n    /*\n     * No mutation of the active method map occurred",
    '''      registerRouteIntoTable(table, route);\n\n      if (!enableRequestUrlFastPath && routePathHasParams(route.path)) {\n        enableRequestUrlFastPath = true;\n      }\n    }\n\n    /*\n     * No mutation of the active method map occurred''',
    1,
)

router = router.replace(
    "    this.#methods = nextMethods;\n  }\n\n  match(method: string, pathname: string)",
    '''    this.#methods = nextMethods;\n\n    if (enableRequestUrlFastPath) {\n      this.enableRequestUrlFastPath();\n    }\n  }\n\n  match(method: string, pathname: string)''',
    1,
)

router = router.replace(
    "  private getOrCreateMethod(method: string): MethodRoutes {",
    '''  private enableRequestUrlFastPath(): void {\n    if (Object.prototype.hasOwnProperty.call(this, "matchRequestUrl")) {\n      Reflect.deleteProperty(this, "matchRequestUrl");\n    }\n  }\n\n  private getOrCreateMethod(method: string): MethodRoutes {''',
    1,
)

router = router.replace(
    "function methodTableMatchesPath(\n",
    '''function routePathHasParams(path: string): boolean {\n  const segments = splitPath(path);\n\n  for (const segment of segments) {\n    if (segment.startsWith(":")) {\n      return true;\n    }\n  }\n\n  return false;\n}\n\nfunction methodTableMatchesPath(\n''',
    1,
)

router_path.write_text(router)

app_path = Path("src/app.ts")
app = subprocess.check_output(["git", "show", f"{BASE}:src/app.ts"], text=True)
app = app.replace("    const router = new Router();", "    const router = new Router(false);", 1)
app_path.write_text(app)

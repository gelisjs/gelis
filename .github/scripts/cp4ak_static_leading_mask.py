from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text(encoding="utf-8")

old_interface = '''  staticPathLengthMin?: number;\n\n  staticPathLengthMax?: number;\n'''
new_interface = '''  staticPathLengthMin?: number;\n\n  staticPathLeadMask?: number;\n\n  staticPathLengthMax?: number;\n'''
if text.count(old_interface) != 1:
    raise SystemExit(f"expected one MethodRoutes static metadata block, found {text.count(old_interface)}")
text = text.replace(old_interface, new_interface, 1)

old_create = '''    staticPathLengthMin: Number.POSITIVE_INFINITY,\n\n    staticPathLengthMax: Number.NEGATIVE_INFINITY,\n'''
new_create = '''    staticPathLeadMask: 0,\n\n    staticPathLengthMax: Number.NEGATIVE_INFINITY,\n'''
if text.count(old_create) != 1:
    raise SystemExit(f"expected one createMethodRoutes static metadata block, found {text.count(old_create)}")
text = text.replace(old_create, new_create, 1)

old_clone = '''    ...(table.staticPathLengthMin === undefined\n      ? {}\n      : { staticPathLengthMin: table.staticPathLengthMin }),\n\n    ...(table.staticPathLengthMax === undefined\n      ? {}\n      : { staticPathLengthMax: table.staticPathLengthMax }),\n'''
new_clone = '''    ...(table.staticPathLengthMin === undefined\n      ? {}\n      : { staticPathLengthMin: table.staticPathLengthMin }),\n\n    ...(table.staticPathLeadMask === undefined\n      ? {}\n      : { staticPathLeadMask: table.staticPathLeadMask }),\n\n    ...(table.staticPathLengthMax === undefined\n      ? {}\n      : { staticPathLengthMax: table.staticPathLengthMax }),\n'''
if text.count(old_clone) != 1:
    raise SystemExit(f"expected one clone static metadata block, found {text.count(old_clone)}")
text = text.replace(old_clone, new_clone, 1)

old_registration = '''    const pathLength = route.path.length;\n    const staticPathLengthMin = table.staticPathLengthMin;\n    const staticPathLengthMax = table.staticPathLengthMax;\n\n    if (staticPathLengthMin !== undefined && pathLength < staticPathLengthMin) {\n      table.staticPathLengthMin = pathLength;\n    }\n\n    if (staticPathLengthMax !== undefined && pathLength > staticPathLengthMax) {\n      table.staticPathLengthMax = pathLength;\n    }\n'''
new_registration = '''    const pathLength = route.path.length;\n    const staticPathLengthMin = table.staticPathLengthMin;\n    const staticPathLeadMask = table.staticPathLeadMask;\n    const staticPathLengthMax = table.staticPathLengthMax;\n\n    if (staticPathLengthMin !== undefined && pathLength < staticPathLengthMin) {\n      table.staticPathLengthMin = pathLength;\n    }\n\n    if (staticPathLeadMask !== undefined) {\n      const leadCode = route.path.charCodeAt(1) & 31;\n      table.staticPathLeadMask = staticPathLeadMask | (1 << leadCode);\n    }\n\n    if (staticPathLengthMax !== undefined && pathLength > staticPathLengthMax) {\n      table.staticPathLengthMax = pathLength;\n    }\n'''
if text.count(old_registration) != 1:
    raise SystemExit(f"expected one static registration metadata block, found {text.count(old_registration)}")
text = text.replace(old_registration, new_registration, 1)

old_dispatch = '''    /*\n     * Preserve CP4-I's upper-bound negative discrimination, but restore the\n     * CP4-E ordering for the exact-static lane. This isolates request-dispatch\n     * control flow from the already-frozen registration metadata shape.\n     */\n    if (table.staticRoutes.size !== 0) {\n      const staticPathLengthMax = table.staticPathLengthMax;\n\n      if (\n        staticPathLengthMax === undefined ||\n        pathEnd - pathStart <= staticPathLengthMax\n      ) {\n        pathname = url.slice(pathStart, pathEnd);\n\n        const staticRoute = table.staticRoutes.get(pathname);\n\n        if (staticRoute) {\n          return {\n            route: staticRoute,\n            params: EMPTY_PARAMS,\n          };\n        }\n      }\n    }\n'''
new_dispatch = '''    /*\n     * Runtime-created tables carry a conservative bitmask derived from the\n     * first UTF-16 code unit after the leading slash of each static path. A\n     * missing bit proves that no exact static route can match this request,\n     * so dynamic requests may skip substring allocation + Map lookup. When\n     * the bit is present, perform the canonical exact lookup directly without\n     * paying the upper-bound discriminator on the static-hit path.\n     *\n     * Legacy/AOT/prebuilt tables without this metadata retain CP4-AI's\n     * conservative static-length upper-bound behavior. Bit collisions are\n     * harmless false positives and only cause the canonical lookup.\n     */\n    if (table.staticRoutes.size !== 0) {\n      const staticPathLeadMask = table.staticPathLeadMask;\n      let mayMatchStatic: boolean;\n\n      if (staticPathLeadMask === undefined) {\n        const staticPathLengthMax = table.staticPathLengthMax;\n        mayMatchStatic =\n          staticPathLengthMax === undefined ||\n          pathEnd - pathStart <= staticPathLengthMax;\n      } else {\n        const leadBit = 1 << (url.charCodeAt(pathStart + 1) & 31);\n        mayMatchStatic = (staticPathLeadMask & leadBit) !== 0;\n      }\n\n      if (mayMatchStatic) {\n        pathname = url.slice(pathStart, pathEnd);\n\n        const staticRoute = table.staticRoutes.get(pathname);\n\n        if (staticRoute) {\n          return {\n            route: staticRoute,\n            params: EMPTY_PARAMS,\n          };\n        }\n      }\n    }\n'''
if text.count(old_dispatch) != 1:
    raise SystemExit(f"expected one CP4-AI static dispatch block, found {text.count(old_dispatch)}")
text = text.replace(old_dispatch, new_dispatch, 1)

path.write_text(text, encoding="utf-8")

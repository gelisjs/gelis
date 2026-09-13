from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

replacements = [
    (
'''type FastMapKind = 0 | 1 | 2;\n\nconst FAST_MAP_STATIC_ONLY: FastMapKind = 0;\nconst FAST_MAP_TRAILING_ONLY: FastMapKind = 1;\nconst FAST_MAP_MIXED: FastMapKind = 2;''',
'''const FAST_MAP_TRAILING_ONLY = -1;\nconst FAST_MAP_EMPTY = 0;'''
    ),
    (
'''  fastMapKind?: FastMapKind;\n\n  staticPathLengthMin?: number;\n\n  staticPathLengthMax?: number;''',
'''  fastMapState?: number;'''
    ),
    (
'''    const fastMapKind = table.fastMapKind;\n\n    if (fastMapKind === undefined && table.usesDynamicTrie) {''',
'''    const fastMapState = table.fastMapState;\n\n    if (fastMapState === undefined && table.usesDynamicTrie) {'''
    ),
    (
'''    if (fastMapKind !== FAST_MAP_TRAILING_ONLY) {\n      if (fastMapKind === FAST_MAP_STATIC_ONLY) {''',
'''    if (fastMapState !== FAST_MAP_TRAILING_ONLY) {\n      if (fastMapState !== undefined && fastMapState > FAST_MAP_EMPTY) {'''
    ),
    (
'''      if (fastMapKind === FAST_MAP_MIXED) {\n        const staticPathLengthMax = table.staticPathLengthMax!;\n\n        if (pathEnd - pathStart <= staticPathLengthMax) {''',
'''      if (fastMapState !== undefined && fastMapState < FAST_MAP_TRAILING_ONLY) {\n        if (pathEnd - pathStart <= -fastMapState - 1) {'''
    ),
    (
'''    if (fastMapKind !== undefined || !table.usesDynamicTrie) {''',
'''    if (fastMapState !== undefined || !table.usesDynamicTrie) {'''
    ),
    (
'''    fastMapKind: FAST_MAP_STATIC_ONLY,\n\n    staticPathLengthMin: Number.POSITIVE_INFINITY,\n\n    staticPathLengthMax: Number.NEGATIVE_INFINITY,''',
'''    fastMapState: FAST_MAP_EMPTY,'''
    ),
    (
'''    ...(table.fastMapKind === undefined\n      ? {}\n      : { fastMapKind: table.fastMapKind }),\n\n    ...(table.staticPathLengthMin === undefined\n      ? {}\n      : { staticPathLengthMin: table.staticPathLengthMin }),\n\n    ...(table.staticPathLengthMax === undefined\n      ? {}\n      : { staticPathLengthMax: table.staticPathLengthMax }),''',
'''    ...(table.fastMapState === undefined\n      ? {}\n      : { fastMapState: table.fastMapState }),'''
    ),
    (
'''    if (table.fastMapKind === FAST_MAP_TRAILING_ONLY) {\n      table.fastMapKind = FAST_MAP_MIXED;\n    }\n\n    const pathLength = route.path.length;\n    const staticPathLengthMin = table.staticPathLengthMin;\n    const staticPathLengthMax = table.staticPathLengthMax;\n\n    if (staticPathLengthMin !== undefined && pathLength < staticPathLengthMin) {\n      table.staticPathLengthMin = pathLength;\n    }\n\n    if (staticPathLengthMax !== undefined && pathLength > staticPathLengthMax) {\n      table.staticPathLengthMax = pathLength;\n    }''',
'''    const pathLength = route.path.length;\n    const fastMapState = table.fastMapState;\n\n    if (fastMapState === FAST_MAP_TRAILING_ONLY) {\n      table.fastMapState = -(pathLength + 1);\n    } else if (fastMapState !== undefined) {\n      if (\n        fastMapState === FAST_MAP_EMPTY ||\n        (fastMapState > FAST_MAP_EMPTY && pathLength > fastMapState)\n      ) {\n        table.fastMapState = pathLength;\n      } else if (fastMapState < FAST_MAP_TRAILING_ONLY) {\n        const staticPathLengthMax = -fastMapState - 1;\n\n        if (pathLength > staticPathLengthMax) {\n          table.fastMapState = -(pathLength + 1);\n        }\n      }\n    }'''
    ),
    (
'''  if (trailingParamName !== undefined && !table.usesDynamicTrie) {\n    if (table.fastMapKind === FAST_MAP_STATIC_ONLY) {\n      table.fastMapKind =\n        table.staticRoutes.size === 0 ? FAST_MAP_TRAILING_ONLY : FAST_MAP_MIXED;\n    }''',
'''  if (trailingParamName !== undefined && !table.usesDynamicTrie) {\n    const fastMapState = table.fastMapState;\n\n    if (fastMapState === FAST_MAP_EMPTY) {\n      table.fastMapState = FAST_MAP_TRAILING_ONLY;\n    } else if (fastMapState !== undefined && fastMapState > FAST_MAP_EMPTY) {\n      table.fastMapState = -(fastMapState + 1);\n    }'''
    ),
    (
'''    delete table.fastMapKind;\n    table.usesDynamicTrie = true;''',
'''    delete table.fastMapState;\n    table.usesDynamicTrie = true;'''
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"missing replacement pattern:\n{old}")
    text = text.replace(old, new, 1)

if "fastMapKind" in text or "staticPathLengthMin" in text or "staticPathLengthMax?:" in text:
    raise SystemExit("stale CP4-I metadata identifiers remain")

path.write_text(text)

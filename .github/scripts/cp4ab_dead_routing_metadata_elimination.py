from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

replacements = [
    (
        '''type FastMapKind = 0 | 1 | 2;\n\nconst FAST_MAP_STATIC_ONLY: FastMapKind = 0;\nconst FAST_MAP_TRAILING_ONLY: FastMapKind = 1;\nconst FAST_MAP_MIXED: FastMapKind = 2;\n\n''',
        '',
    ),
    (
        '''  fastMapKind?: FastMapKind;\n\n  staticPathLengthMin?: number;\n\n  staticPathLengthMax?: number;\n''',
        '''  staticPathLengthMax?: number;\n''',
    ),
    (
        '''    fastMapKind: FAST_MAP_STATIC_ONLY,\n\n    staticPathLengthMin: Number.POSITIVE_INFINITY,\n\n    staticPathLengthMax: Number.NEGATIVE_INFINITY,\n''',
        '''    staticPathLengthMax: Number.NEGATIVE_INFINITY,\n''',
    ),
    (
        '''    ...(table.fastMapKind === undefined\n      ? {}\n      : { fastMapKind: table.fastMapKind }),\n\n    ...(table.staticPathLengthMin === undefined\n      ? {}\n      : { staticPathLengthMin: table.staticPathLengthMin }),\n\n    ...(table.staticPathLengthMax === undefined\n''',
        '''    ...(table.staticPathLengthMax === undefined\n''',
    ),
    (
        '''    if (table.fastMapKind === FAST_MAP_TRAILING_ONLY) {\n      table.fastMapKind = FAST_MAP_MIXED;\n    }\n\n    const pathLength = route.path.length;\n    const staticPathLengthMin = table.staticPathLengthMin;\n    const staticPathLengthMax = table.staticPathLengthMax;\n\n    if (staticPathLengthMin !== undefined && pathLength < staticPathLengthMin) {\n      table.staticPathLengthMin = pathLength;\n    }\n\n    if (staticPathLengthMax !== undefined && pathLength > staticPathLengthMax) {\n''',
        '''    const pathLength = route.path.length;\n    const staticPathLengthMax = table.staticPathLengthMax;\n\n    if (staticPathLengthMax !== undefined && pathLength > staticPathLengthMax) {\n''',
    ),
    (
        '''  if (trailingParamName !== undefined && !table.usesDynamicTrie) {\n    if (table.fastMapKind === FAST_MAP_STATIC_ONLY) {\n      table.fastMapKind =\n        table.staticRoutes.size === 0 ? FAST_MAP_TRAILING_ONLY : FAST_MAP_MIXED;\n    }\n\n    const slash = route.path.lastIndexOf("/");\n''',
        '''  if (trailingParamName !== undefined && !table.usesDynamicTrie) {\n    const slash = route.path.lastIndexOf("/");\n''',
    ),
    (
        '''    migrateTrailingRoutesToTrie(table);\n\n    delete table.fastMapKind;\n    table.usesDynamicTrie = true;\n''',
        '''    migrateTrailingRoutesToTrie(table);\n\n    table.usesDynamicTrie = true;\n''',
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one match, got {count}: {old[:80]!r}")
    text = text.replace(old, new, 1)

for forbidden in ("FastMapKind", "fastMapKind", "staticPathLengthMin", "FAST_MAP_"):
    if forbidden in text:
        raise SystemExit(f"forbidden residual token: {forbidden}")

path.write_text(text)

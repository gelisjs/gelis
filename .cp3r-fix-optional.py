from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

create_block = """    trailingParamRoutes: undefined,

    trailingParamFingerprints: undefined,

    dynamicRoot:"""
create_replacement = """    trailingParamRoutes: undefined,

    dynamicRoot:"""
if text.count(create_block) != 1:
    raise SystemExit("expected one createMethodRoutes sidecar initializer")
text = text.replace(create_block, create_replacement, 1)

clone_block = """    trailingParamFingerprints: cloneTrailingParamFingerprints(
      table.trailingParamFingerprints,
    ),

    dynamicRoot:"""
clone_replacement = """    ...(table.trailingParamFingerprints === undefined
      ? {}
      : {
          trailingParamFingerprints: cloneTrailingParamFingerprints(
            table.trailingParamFingerprints,
          ),
        }),

    dynamicRoot:"""
if text.count(clone_block) != 1:
    raise SystemExit("expected one clone sidecar initializer")
text = text.replace(clone_block, clone_replacement, 1)

cleanup = "  table.trailingParamFingerprints = undefined;"
if text.count(cleanup) != 1:
    raise SystemExit("expected one sidecar migration cleanup")
text = text.replace(cleanup, "  delete table.trailingParamFingerprints;", 1)

path.write_text(text)

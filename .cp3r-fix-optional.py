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

clone_helper_old = """function cloneTrailingParamFingerprints(
  fingerprints: Map<number, TrailingFingerprintEntry> | undefined,
): Map<number, TrailingFingerprintEntry> | undefined {
  if (fingerprints === undefined) {
    return undefined;
  }

  const cloned = new Map<number, TrailingFingerprintEntry>();"""
clone_helper_new = """function cloneTrailingParamFingerprints(
  fingerprints: Map<number, TrailingFingerprintEntry>,
): Map<number, TrailingFingerprintEntry> {
  const cloned = new Map<number, TrailingFingerprintEntry>();"""
if text.count(clone_helper_old) != 1:
    raise SystemExit("expected one broad clone helper signature")
text = text.replace(clone_helper_old, clone_helper_new, 1)

path.write_text(text)

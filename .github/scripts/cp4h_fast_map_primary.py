from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

old = '''    /*
     * Generic trie matching already requires a materialized pathname.
     * Avoid paying the full-URL offset parser before falling back to it.
     */
    if (table.usesDynamicTrie) {
      return this.match(method, pathnameFromRequestUrl(url));
    }

    let authorityStart: number;
'''
new = '''    /*
     * Runtime-created fast-map tables carry a registration-time kind.
     * Treat that kind as the primary capability discriminator so fast-map
     * requests do not pay a separate usesDynamicTrie property read/branch.
     * Legacy/prebuilt tables without a kind retain the conservative check.
     */
    const fastMapKind = table.fastMapKind;

    if (fastMapKind === undefined && table.usesDynamicTrie) {
      return this.match(method, pathnameFromRequestUrl(url));
    }

    let authorityStart: number;
'''
if old not in text:
    raise SystemExit("generic discriminator anchor not found")
text = text.replace(old, new, 1)

old = '''    const fastMapKind = table.fastMapKind;

    if (fastMapKind !== FAST_MAP_TRAILING_ONLY) {
'''
new = '''    if (fastMapKind !== FAST_MAP_TRAILING_ONLY) {
'''
if old not in text:
    raise SystemExit("duplicate fastMapKind anchor not found")
text = text.replace(old, new, 1)

old = '''    if (!table.usesDynamicTrie) {
      if (
'''
new = '''    if (fastMapKind !== undefined || !table.usesDynamicTrie) {
      if (
'''
if old not in text:
    raise SystemExit("fast-map trailing discriminator anchor not found")
text = text.replace(old, new, 1)

old = '''  if (!table.usesDynamicTrie) {
    migrateTrailingRoutesToTrie(table);

    table.usesDynamicTrie = true;
  }
'''
new = '''  if (!table.usesDynamicTrie) {
    migrateTrailingRoutesToTrie(table);

    delete table.fastMapKind;
    table.usesDynamicTrie = true;
  }
'''
if old not in text:
    raise SystemExit("generic migration anchor not found")
text = text.replace(old, new, 1)

path.write_text(text)

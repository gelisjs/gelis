from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

old = '''function trailingRoutePrefixMatches(
  route: TrailingParamRoute,
  value: string,
  start: number,
  prefixLength: number,
): boolean {
  const routePath = route.route.path;

  if (trailingRoutePrefixLength(route) !== prefixLength) {
    return false;
  }

  for (let index = 0; index < prefixLength; index++) {
    if (routePath.charCodeAt(index) !== value.charCodeAt(start + index)) {
      return false;
    }
  }

  return true;
}
'''
new = '''function trailingRoutePrefixMatches(
  route: TrailingParamRoute,
  value: string,
  start: number,
  prefixLength: number,
): boolean {
  if (trailingRoutePrefixLength(route) !== prefixLength) {
    return false;
  }

  return route.route.path.startsWith(
    value.slice(start, start + prefixLength),
  );
}
'''

count = text.count(old)
if count != 1:
    raise SystemExit(f"native prefix helper: expected one match, got {count}")

path.write_text(text.replace(old, new, 1))

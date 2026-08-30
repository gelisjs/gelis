export function pathnameFromUrl(url: string): string {
  const schemeEnd = url.indexOf("://");

  if (schemeEnd === -1) {
    return new URL(url).pathname;
  }

  const authorityStart = schemeEnd + 3;

  const pathStart = url.indexOf("/", authorityStart);

  const queryStart = url.indexOf("?", authorityStart);

  const hashStart = url.indexOf("#", authorityStart);

  if (
    pathStart === -1 ||
    (queryStart !== -1 && queryStart < pathStart) ||
    (hashStart !== -1 && hashStart < pathStart)
  ) {
    return "/";
  }

  let pathEnd = url.length;

  if (queryStart !== -1 && queryStart > pathStart) {
    pathEnd = queryStart;
  }

  if (hashStart !== -1 && hashStart > pathStart && hashStart < pathEnd) {
    pathEnd = hashStart;
  }

  return url.slice(pathStart, pathEnd);
}

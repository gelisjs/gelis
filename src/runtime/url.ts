export function pathnameFromRequestUrl(url: string): string {
  if (
    url.charCodeAt(0) !== 104 ||
    url.charCodeAt(1) !== 116 ||
    url.charCodeAt(2) !== 116 ||
    url.charCodeAt(3) !== 112
  ) {
    return pathnameFromUrl(url);
  }

  let authorityStart: number;

  if (
    url.charCodeAt(4) === 58 &&
    url.charCodeAt(5) === 47 &&
    url.charCodeAt(6) === 47
  ) {
    authorityStart = 7;
  } else if (
    url.charCodeAt(4) === 115 &&
    url.charCodeAt(5) === 58 &&
    url.charCodeAt(6) === 47 &&
    url.charCodeAt(7) === 47
  ) {
    authorityStart = 8;
  } else {
    return pathnameFromUrl(url);
  }

  const pathStart = url.indexOf("/", authorityStart);

  if (pathStart === -1) {
    return "/";
  }

  const queryStart = url.indexOf("?", pathStart + 1);

  return queryStart === -1
    ? url.slice(pathStart)
    : url.slice(pathStart, queryStart);
}

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

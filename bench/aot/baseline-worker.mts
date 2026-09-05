const ROUTES = Number(process.env.ROUTES ?? "1");

const ROUTE_KIND = process.env.ROUTE_KIND === "dynamic" ? "dynamic" : "static";

const importStarted = performance.now();

const { Gelis } = await import("../../src/index.ts");

const importMs = performance.now() - importStarted;

const constructStarted = performance.now();

const app = new Gelis();

const constructMs = performance.now() - constructStarted;

const RAW_RESPONSE = new Response(null, {
  status: 204,
});

/*
 * Benchmark infrastructure intentionally widens
 * the public typed route method here.
 *
 * P6-A measures runtime registration cost,
 * not TypeScript inference cost.
 */
const registerGet = app.get.bind(app) as (
  path: string,

  handler: () => Response,
) => unknown;

const registrationStarted = performance.now();

for (let index = 0; index < ROUTES; index++) {
  const path = ROUTE_KIND === "static" ? `/r/${index}` : `/r/${index}/:id`;

  registerGet(
    path,

    () => RAW_RESPONSE,
  );
}

const registrationMs = performance.now() - registrationStarted;

const memory = process.memoryUsage();

const targetPath =
  ROUTE_KIND === "static" ? `/r/${ROUTES - 1}` : `/r/${ROUTES - 1}/target`;

const request = new Request(`http://gelis.test${targetPath}`);

const firstFetchStarted = performance.now();

const firstResult = app.fetch(request);

const response = isPromiseLike(firstResult) ? await firstResult : firstResult;

const firstFetchUs = (performance.now() - firstFetchStarted) * 1000;

if (response.status !== 204) {
  throw new Error(`Unexpected first response: ${response.status}`);
}

console.log(
  JSON.stringify({
    routes: ROUTES,

    routeKind: ROUTE_KIND,

    importMs,

    constructMs,

    registrationMs,

    runtimeReadyMs: importMs + constructMs + registrationMs,

    firstFetchUs,

    rssBytes: memory.rss,

    heapUsedBytes: memory.heapUsed,

    heapTotalBytes: memory.heapTotal,
  }),
);

function isPromiseLike(value: unknown): value is PromiseLike<Response> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value
  );
}

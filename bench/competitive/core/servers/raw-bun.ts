const PORT = Number(process.env.PORT ?? 3100);
const ROUTES = Number(process.env.ROUTES ?? 3);
const ROUTE_KIND = process.env.ROUTE_KIND ?? "static";
const BODY_KIND = process.env.BODY_KIND ?? "json";

type RoutedRequest = Request & {
  readonly params: Record<string, string>;
};

type RouteHandler = (request: RoutedRequest) => Response;

const routes: Record<string, RouteHandler> = Object.create(null);

if (ROUTE_KIND === "static") {
  for (let index = 0; index < ROUTES; index++) {
    const path = `/r/${index}`;

    routes[path] =
      BODY_KIND === "raw"
        ? (request) => new Response(request.method)
        : (request) =>
            Response.json({
              method: request.method,
              route: index,
            });
  }
} else {
  for (let index = 0; index < ROUTES; index++) {
    const path = `/r/${index}/:id`;

    routes[path] =
      BODY_KIND === "raw"
        ? (request) => new Response(request.params.id)
        : (request) =>
            Response.json({
              method: request.method,
              id: request.params.id,
            });
  }
}

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  reusePort: false,
  routes,
  fetch: () => new Response("Not Found", { status: 404 }),
});

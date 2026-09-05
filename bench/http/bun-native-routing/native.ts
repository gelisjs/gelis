const PORT = Number(process.env.PORT ?? "3100");

const ROUTES = Number(process.env.ROUTES ?? "5000");

const ROUTE_KIND = process.env.ROUTE_KIND === "dynamic" ? "dynamic" : "static";

const BODY_KIND = process.env.BODY_KIND === "json" ? "json" : "raw";

const routes: Record<string, (request: Bun.BunRequest<string>) => Response> =
  {};

const rawResponse = new Response(null, {
  status: 204,
});

for (let index = 0; index < ROUTES; index++) {
  const path = ROUTE_KIND === "static" ? `/r/${index}` : `/r/${index}/:id`;

  if (BODY_KIND === "raw") {
    routes[path] = () => rawResponse;

    continue;
  }

  if (ROUTE_KIND === "static") {
    routes[path] = () =>
      Response.json({
        ok: true,
        route: index,
      });

    continue;
  }

  routes[path] = (request) =>
    Response.json({
      id: request.params.id,
      route: index,
    });
}

Bun.serve({
  hostname: "127.0.0.1",

  port: PORT,

  reusePort: false,

  routes,

  fetch() {
    return new Response("Not Found", {
      status: 404,
    });
  },
});

console.log(`READY ${PORT}`);

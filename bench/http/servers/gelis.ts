import { Gelis } from "../../../src";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const ROUTE_KIND = process.env.ROUTE_KIND ?? "static";

const BODY_KIND = process.env.BODY_KIND ?? "json";

const app = new Gelis();

if (ROUTE_KIND === "static") {
  for (let index = 0; index < ROUTES; index++) {
    const path = `/r/${index}` as const;

    if (BODY_KIND === "raw") {
      app.get(
        path,

        ({ request }) => new Response(request.method),
      );

      continue;
    }

    app.get(
      path,

      ({ request }) => ({
        method: request.method,

        route: index,
      }),
    );
  }
} else {
  for (let index = 0; index < ROUTES; index++) {
    const path = `/r/${index}/:id` as const;

    if (BODY_KIND === "raw") {
      app.get(
        path,

        ({ params }) => new Response(params.id),
      );

      continue;
    }

    app.get(
      path,

      ({ request, params }) => ({
        method: request.method,

        id: params.id,
      }),
    );
  }
}

Bun.serve({
  port: PORT,

  hostname: "127.0.0.1",

  reusePort: false,

  fetch: app.fetch.bind(app),
});

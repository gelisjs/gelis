import { Hono } from "hono";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const ROUTE_KIND = process.env.ROUTE_KIND ?? "static";

const BODY_KIND = process.env.BODY_KIND ?? "json";

const app = new Hono();

if (ROUTE_KIND === "static") {
  for (let index = 0; index < ROUTES; index++) {
    const path = `/r/${index}`;

    if (BODY_KIND === "raw") {
      app.get(
        path,

        (context) => new Response(context.req.raw.method),
      );

      continue;
    }

    app.get(
      path,

      (context) =>
        context.json({
          method: context.req.raw.method,

          route: index,
        }),
    );
  }
} else {
  for (let index = 0; index < ROUTES; index++) {
    const path = `/r/${index}/:id`;

    if (BODY_KIND === "raw") {
      app.get(
        path,

        (context) => new Response(context.req.param("id")),
      );

      continue;
    }

    app.get(
      path,

      (context) =>
        context.json({
          method: context.req.raw.method,

          id: context.req.param("id"),
        }),
    );
  }
}

Bun.serve({
  port: PORT,

  hostname: "127.0.0.1",

  reusePort: false,

  fetch: app.fetch,
});

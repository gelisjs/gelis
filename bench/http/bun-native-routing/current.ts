import { Gelis } from "../../../src/index.ts";

const PORT = Number(process.env.PORT ?? "3100");

const ROUTES = Number(process.env.ROUTES ?? "5000");

const ROUTE_KIND = process.env.ROUTE_KIND === "dynamic" ? "dynamic" : "static";

const BODY_KIND = process.env.BODY_KIND === "json" ? "json" : "raw";

const app = new Gelis();

const rawResponse = new Response(null, {
  status: 204,
});

for (let index = 0; index < ROUTES; index++) {
  const path = ROUTE_KIND === "static" ? `/r/${index}` : `/r/${index}/:id`;

  if (BODY_KIND === "raw") {
    app.get(path, () => rawResponse);

    continue;
  }

  if (ROUTE_KIND === "static") {
    app.get(path, () => ({
      ok: true,
      route: index,
    }));

    continue;
  }

  app.get(path, ({ params }) => ({
    id: (params as { id: string }).id,
    route: index,
  }));
}

Bun.serve({
  hostname: "127.0.0.1",

  port: PORT,

  reusePort: false,

  fetch: app.fetch.bind(app),
});

console.log(`READY ${PORT}`);

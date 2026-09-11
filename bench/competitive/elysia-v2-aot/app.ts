import { Elysia } from "elysia";

const ROUTES = Number(process.env.ROUTES ?? 3);
const ROUTE_KIND = process.env.ROUTE_KIND ?? "static";
const BODY_KIND = process.env.BODY_KIND ?? "json";

type BenchmarkParams = {
  id: string;
};

const app = new Elysia({
  serve: {
    hostname: "127.0.0.1",
    reusePort: false,
  },
});

if (ROUTE_KIND === "static") {
  for (let index = 0; index < ROUTES; index++) {
    const path = `/r/${index}`;

    if (BODY_KIND === "raw") {
      app.get(path, ({ request }) => new Response(request.method));
      continue;
    }

    app.get(path, ({ request }) => ({ method: request.method, route: index }));
  }
} else {
  for (let index = 0; index < ROUTES; index++) {
    const path = `/r/${index}/:id`;

    if (BODY_KIND === "raw") {
      app.get(path, ({ params }) => new Response((params as BenchmarkParams).id));
      continue;
    }

    app.get(path, ({ request, params }) => ({
      method: request.method,
      id: (params as BenchmarkParams).id,
    }));
  }
}

export default app;

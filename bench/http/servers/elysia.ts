import { Elysia } from "elysia";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

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
    const path = `/r/${index}/:id`;

    if (BODY_KIND === "raw") {
      app.get(
        path,

        ({ params }) => {
          const typedParams = params as BenchmarkParams;

          return new Response(typedParams.id);
        },
      );

      continue;
    }

    app.get(
      path,

      ({ request, params }) => {
        const typedParams = params as BenchmarkParams;

        return {
          method: request.method,

          id: typedParams.id,
        };
      },
    );
  }
}

app.listen(PORT);

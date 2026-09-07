import { definePlugin, Gelis } from "../../src";

import type { Equal, Expect } from "./assert";

const nestedPlugin = definePlugin("nested", () => {});

const plugin = definePlugin(
  "composition-types",

  (setup) => {
    setup.routes.get(
      "/users/:id",

      ({ params }) => {
        const id: string = params.id;

        return id;
      },
    );

    setup.onRequest(({ request }) => {
      const method: string = request.method;

      void method;
    });

    setup.onBeforeHandle(({ request }) => {
      const url: string = request.url;

      void url;
    });

    const services = setup.scope({
      database: {
        name: "primary" as const,
      },
    });

    services.get(
      "/database",

      (_context, scope) => {
        const name: "primary" = scope.database.name;

        return name;
      },
    );

    const authenticated = setup.requestScope(({ request }) => ({
      user: {
        id: request.headers.get("x-user") ?? "anonymous",
      },
    }));

    authenticated.get(
      "/profile",

      (_context, scope) => {
        const id: string = scope.user.id;

        return id;
      },
    );

    // @ts-expect-error nested plugin installation is not part of setup composition.
    setup.use(nestedPlugin);

    // @ts-expect-error module mounting is not part of plugin setup composition.
    setup.mount(null);

    // @ts-expect-error route registration is intentionally namespaced under routes.
    setup.get(
      "/invalid",

      () => "invalid",
    );
  },
);

const app = new Gelis();

type RootBefore = typeof app;

app.use(plugin);

type RootAfter = typeof app;

type StableRoot = Expect<Equal<RootBefore, RootAfter>>;

export type { StableRoot };

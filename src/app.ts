import { RouteBuilder } from "./route-builder";

import { getModuleRuntimeRoutes } from "./module";

import { Router } from "./runtime/router";

import { normalizeResponse, runtimeReply } from "./runtime/response";

import type { ModuleRef, ModuleRoutes } from "./module";

export class Gelis extends RouteBuilder<""> {
  readonly #router: Router;

  constructor() {
    const router = new Router();

    super(
      "",

      (route) => {
        router.register(route);
      },
    );

    this.#router = router;
  }

  mount<const Prefix extends string, const Routes extends ModuleRoutes>(
    module: ModuleRef<Prefix, Routes>,
  ): void {
    const routes = getModuleRuntimeRoutes(module);

    for (const route of routes) {
      this.#router.register(route);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    const matched = this.#router.match(request.method, pathname);

    if (!matched) {
      return new Response("Not Found", {
        status: 404,
      });
    }

    const { route, params } = matched;

    if (
      route.options?.query !== undefined ||
      route.options?.body !== undefined
    ) {
      throw new Error(
        "Runtime query/body validation " + "is not implemented yet",
      );
    }

    const result = await route.handler({
      request,
      params,

      query: undefined,

      body: undefined,

      reply: runtimeReply,
    });

    return normalizeResponse(result);
  }
}

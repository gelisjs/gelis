import { Gelis } from "../../src";

import type { OnRequestContext } from "../../src";

const app = new Gelis();

app.onRequest((context) => {
  const typedContext: OnRequestContext = context;

  const request: Request = context.request;

  void typedContext;
  void request;

  /*
   * onRequest executes before routing.
   */
  // @ts-expect-error
  context.params;

  // @ts-expect-error
  context.query;

  // @ts-expect-error
  context.body;

  return undefined;
});

const sameApp: Gelis = app.onRequest(() => undefined);

void sameApp;

class CustomGelis extends Gelis {
  customMethod(): this {
    return this;
  }
}

const custom = new CustomGelis();

custom.onRequest(() => undefined).customMethod();

/*
 * onRequest chaining must not damage
 * route param inference.
 */
new Gelis()
  .onRequest(() => undefined)
  .get(
    "/users/:id",

    ({ params }) => {
      const id: string = params.id;

      return id;
    },
  );

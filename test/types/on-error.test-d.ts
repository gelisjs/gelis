import { Gelis } from "../../src";

import type { OnErrorContext } from "../../src";

import type { Equal, Expect } from "./assert";

const app = new Gelis();

const returned = app.onError(({ request, error }) => {
  const requestValue: Request = request;

  const errorValue: unknown = error;

  void requestValue;
  void errorValue;

  return undefined;
});

type ReturnsSameApp = Expect<Equal<typeof returned, typeof app>>;

type ContextKeys = Expect<Equal<keyof OnErrorContext, "request" | "error">>;

app.onError((context) => {
  context.request;
  context.error;

  // @ts-expect-error onError is pre-route/global and has no params
  context.params;

  // @ts-expect-error onError has no validated query in v0.1
  context.query;

  // @ts-expect-error onError has no validated body in v0.1
  context.body;

  // @ts-expect-error onError has no route-specific reply in v0.1
  context.reply;
});

class CustomApp extends Gelis {
  readonly marker = true;
}

const custom = new CustomApp();

const customReturned = custom.onError(() => undefined);

type PreservesSubclass = Expect<Equal<typeof customReturned, CustomApp>>;

app
  .onError(() => undefined)
  .get("/users/:id", ({ params }) => {
    const id: string = params.id;

    return id;
  });

export type { ContextKeys, PreservesSubclass, ReturnsSameApp };

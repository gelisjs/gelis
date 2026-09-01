import { Gelis } from "../../src";

import type { GlobalRouteContext } from "../../src";

const app = new Gelis();

const beforeResult = app.onBeforeHandle((context) => {
  const request: Request = context.request;

  const params: Record<string, string> = context.params;

  const query: unknown = context.query;

  const body: unknown = context.body;

  const reply: unknown = context.reply.status(
    401,

    {
      code: "UNAUTHORIZED",
    },
  );

  void request;
  void params;
  void query;
  void body;
  void reply;
});

const sameApp: Gelis = beforeResult;

app.onAfterHandle((context, result) => {
  const typedContext: GlobalRouteContext = context;

  const unknownResult: unknown = result;

  void typedContext;
  void unknownResult;
});

app
  .onBeforeHandle(() => undefined)
  .onAfterHandle(() => undefined)
  .get(
    "/users/:id",

    ({ params }) => ({
      id: params.id,
    }),
  );

export { sameApp };

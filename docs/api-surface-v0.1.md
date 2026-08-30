# Gelis API Surface v0.1

**Status:** Draft 1 — not frozen.

Exact syntax may change after the type-system prototype is measured.

## Root application

The root application type remains stable.

```ts
const app = new Gelis();

app.get("/health", () => ({
  status: "ok",
}));

app.get("/users/:id", getUser);
```

Route registration returns a compact `RouteRef`.

It must not accumulate every route into the root `Gelis` generic type.

## Runtime boundary

Core will be Web Standards based.

```ts
const response = await app.fetch(request);
```

Runtime startup belongs to adapters such as:

```ts
import { serve } from "@gelis/bun";
```

## Routes

Simple route:

```ts
app.get("/hello", () => ({
  message: "hello",
}));
```

Contract route:

```ts
app.post(
  "/users",
  {
    body: CreateUser,
    responses: {
      201: User,
      409: Conflict,
    },
  },
  ({ body, reply }) => {
    return reply.status(201, createUser(body));
  },
);
```

Contract/options come before the handler.

### Route path syntax

Gelis v0.1 initially supports static path segments and required
named parameters.

Supported:

```text
/
/users
/users/:id
/teams/:teamId/users/:userId
```

Deliberately unsupported during the initial design:

```text
/users/:id?
/files/*
```

Optional parameters are represented as separate explicit routes.

Wildcard/catch-all syntax will be designed together with the runtime
router so its matching semantics and typed contract are defined
together.

Route paths must begin with `/`.

## Context

The intended context includes:

```ts
ctx.request;
ctx.params;
ctx.query;
ctx.headers;
ctx.cookies;
ctx.locals;
ctx.reply;
```

Raw Web Standards must always remain available.

## Body parsing

POST does not automatically mean body parsing.

Body parsing happens only when the route declares a body contract
or application code explicitly reads the raw Request body.

## Responses

Simple values may be returned directly.

Raw `Response` passes through unchanged.

Non-default HTTP responses use a small reply API.

```ts
reply.status(code, body)
reply.json(body, status?)
reply.text(text, status?)
reply.empty(status)
reply.redirect(url, status?)
```

## Middleware

Middleware uses onion-style execution.

Thrown errors propagate through parent middleware before reaching
the global error handler.

## Modules

Modules expose compact named route contracts.

```ts
export const users = defineModule("/users", (route) => ({
  list: route.get("/", listUsers),
  find: route.get("/:id", getUser),
}));
```

## Public API contract

Client and tooling types are explicit.

```ts
export const api = defineContract({
  users,
  health,
});

export type Api = typeof api;
```

They do not use:

```ts
typeof app;
```

## Deliberately absent from core v0.1

- decorators
- dependency injection
- ORM
- built-in schema DSL
- reflection metadata
- source inspection
- AOT compiler
- route-chain-dependent inference

## Open questions

- validation error status and shape
- response-validation default
- body helper syntax
- cookies core vs optional package
- exact module API
- client result API
- WebSocket API
- plugin capability model

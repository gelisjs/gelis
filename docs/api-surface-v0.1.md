# Gelis API Surface v0.1

**Status:** Draft 1 — not frozen.

This document records the approved direction. Exact syntax may change after the type-system prototype is measured.

## Root application

The root application type remains stable rather than accumulating every route into one generic graph.

```ts
const app = new Gelis();

app.get("/health", () => ({ status: "ok" }));
app.get("/users/:id", getUser);
```

Route registration returns a compact `RouteRef` contract token instead of relying on fluent chaining for application-wide type inference.

## Runtime boundary

Core is Fetch/Web-Standards based:

```ts
const response = await app.fetch(request);
```

Runtime startup belongs to adapters such as `@gelis/bun`.

## Routes

Simple:

```ts
app.get("/hello", () => ({ message: "hello" }));
```

With a contract:

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
  ({ body, reply }) => reply.status(201, createUser(body)),
);
```

Contract/options precede the handler.

## Context

A handler context should expose:

```ts
ctx.request;
ctx.params;
ctx.query;
ctx.headers;
ctx.cookies;
ctx.locals;
ctx.reply;
```

while preserving raw Web Standards.

## Body parsing

A POST request alone does not trigger body parsing. A declared body contract signals parsing/validation; otherwise the developer may use `request.json()`, `request.formData()`, `request.text()`, and other Web APIs directly.

## Responses

Simple values may be returned directly. Raw `Response` passes through unchanged.

A small explicit reply API may provide:

```ts
reply.status(code, body);
reply.json(body, status?);
reply.text(text, status?);
reply.empty(status);
reply.redirect(url, status?);
```

Status-specific response contracts must type-check the status/body pair.

## Middleware and errors

Middleware is onion-style. `next()` propagates thrown errors so parent middleware can intercept them. Unhandled errors eventually reach `app.onError()`.

Typed middleware data belongs under scoped `locals` and must not globally widen the root application type.

## Pipeline direction

```text
REQUEST
  ↓
ROUTE MATCH
  ↓
MIDDLEWARE
  ↓
PARSE DECLARED INPUT
  ↓
VALIDATE
  ↓
GUARD
  ↓
HANDLER
  ↓
NORMALIZE RESPONSE
  ↓
MIDDLEWARE UNWIND
  ↓
RESPONSE
```

## Modules and contracts

Modules expose only compact named route contracts:

```ts
export const users = defineModule("/users", (route) => ({
  list: route.get("/", listUsers),
  find: route.get("/:id", getUser),
  create: route.post("/", { body: CreateUser }, createUser),
}));

app.mount(users);
```

Public tooling contracts are explicit:

```ts
export const api = defineContract({
  users,
  health,
});

export type Api = typeof api;
```

Implementation details must not leak through this boundary.

## Validation and OpenAPI

Validation should be Standard Schema-friendly and schema-library agnostic. Validation capability and JSON Schema/OpenAPI serialization capability are distinct.

## Deliberately absent from core v0.1

- decorators/controllers;
- DI container;
- built-in schema DSL;
- ORM;
- reflection metadata;
- source inspection;
- AOT compiler;
- global context type mutation;
- route-chain-dependent inference.

## Open questions

- default validation error status and body shape;
- response-validation default;
- exact body helper syntax;
- cookies in core vs optional package;
- exact group/module API;
- typed-client response shape;
- WebSocket API;
- plugin capability model.

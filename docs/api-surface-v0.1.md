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

## RouteRef public contract

`RouteRef` is a compact public contract token.

It carries normalized public information such as:

```text
method
path
request params
request query input
request body input
response status/output map
```

It must not contain or expose the handler function type, repository
types, service types, database types, or other backend implementation
details.

A route with the same public contract must produce the same public
`RouteRef` type even when its handler implementation is internally
different.

For routes without an explicit response schema, Gelis may infer the
default `200` response type from the handler return value. Only the
normalized return type becomes part of the route contract; the handler
function itself does not.

## Schema input and validated output

Gelis uses the Standard Schema distinction between schema input and
schema output.

For request schemas:

- the public route/client contract uses the schema **input** type;
- the route handler receives the schema **output** type after validation
  and transformation.

Conceptually:

```text
client payload
    ↓
schema input
    ↓
validation / transformation
    ↓
schema output
    ↓
handler
```

Response schemas expose their normalized output type in the public route
contract.

Validation capability and JSON Schema/OpenAPI serialization capability
remain separate concepts.

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

### Typed status responses

When a route declares explicit response contracts, `reply.status()`
is restricted to the declared status codes and each status code is
paired with its declared response body type.

For the initial prototype, routes without an explicit `responses` map
do not receive a typed status set. They should use a direct return for
the default response or a raw Web Standard `Response` escape hatch.

This prevents runtime status behavior from diverging silently from the
public route contract.

## Internal route builder

Root applications and modules share the same internal route declaration
primitive.

Conceptually:

```text
RouteBuilder<''>
    ↓
Gelis

RouteBuilder<'/users'>
    ↓
users module router
```

This is an implementation primitive, not part of the intended public API.

The root application keeps an empty prefix. A module router joins its
module prefix with each local route path before path-parameter inference
and public contract generation.

## Modules

Modules are independently defined bounded route scopes.

```ts
export const users = defineModule("/users", (route) => ({
  list: route.get("/", listUsers),

  find: route.get("/:id", getUser),

  create: route.post(
    "/",
    {
      body: CreateUser,
      responses: {
        201: User,
      },
    },
    createUser,
  ),
}));
```

The object returned by the module callback defines the module's public
named route surface:

```text
users
├── list
├── find
└── create
```

A local module route path is normalized to its full public route path.

For example:

```text
module prefix: /users
local path:    /:id
public path:   /users/:id
```

Path parameters are inferred from the complete public path, including
parameters declared in a module prefix if such prefixes are used.

`defineModule()` must reject arbitrary values in the returned route map.
Public module entries must be Gelis route references.

### Module contract boundary

A module may contain arbitrary implementation details around its route
handlers, but the public module type retains only compact route
contracts.

Conceptually:

```text
handlers
services
repositories
implementation details
        │
        X
        │
        ▼
ModuleRef
├── prefix
└── named RouteRefs
```

`ModuleContractOf<typeof module>` exposes normalized public contracts
for the module's named routes.

Mounting a module:

```ts
const app = new Gelis();

app.mount(users);
```

must not mutate or accumulate the root `Gelis` type.

In type-system terms:

```text
typeof app before mount
=
typeof app after mount
=
Gelis
```

Module contracts therefore scale independently from the root
application generic graph.

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
- exact public contract composition API
- client result API
- WebSocket API
- plugin capability model
- response transformation semantics for schemas whose input and output differ

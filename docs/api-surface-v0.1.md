# Gelis API Surface v0.1

**Status:** Draft 1 — not frozen.

Exact syntax may change after the type-system prototype is measured.

## Root application

The root application type remains stable.

Route registration returns compact `RouteRef` tokens and does not
accumulate every route into the root `Gelis` generic type.

## Runtime boundary

Core is Web Standards based. Runtime startup belongs to adapters such as
`@gelis/bun`.

## Routes

Routes may be declared in a simple form or with an explicit contract.
Contract/options come before the handler.

### Route path syntax

Gelis v0.1 initially supports static path segments and required named
parameters. Optional parameters and wildcard/catch-all syntax remain
deliberately unsupported until their runtime matching semantics are
designed together with the router.

Route paths must begin with `/`.

## RouteRef public contract

`RouteRef` is a compact public contract token carrying normalized public
information:

- method
- full path
- request params
- request query input
- request body input
- response status/output map

It must not expose handler, service, repository, database, or other
backend implementation types.

## Schema input and validated output

Gelis follows the Standard Schema distinction between schema input and
schema output.

For request schemas:

- public/client contracts use schema input types;
- handlers receive schema output types after validation/transformation.

Response schemas expose normalized output types in route contracts.

Validation capability and JSON Schema/OpenAPI serialization capability
remain separate.

## Responses

Simple values may be returned directly. Raw Web Standard `Response`
objects remain an escape hatch.

When explicit response contracts exist, `reply.status()` is restricted
to declared status codes and the body type associated with each status.

Routes without an explicit `responses` map do not receive a typed status
set during the initial prototype.

## Internal route builder

Root applications and modules share an internal `RouteBuilder<Prefix>`
primitive.

The root uses an empty prefix. Module route builders join their module
prefix with local route paths before path-param inference and contract
generation.

`RouteBuilder` is an implementation primitive and is not part of the
intended public API.

## Modules

Modules are independent bounded route scopes created with
`defineModule()`.

The object returned by the module callback defines the module's public
named route surface.

Local module route paths are normalized to full public route paths.
Parameters declared in both module prefixes and local route paths are
inferred together.

`ModuleContractOf<typeof module>` exposes only normalized named route
contracts. Module implementation details do not cross this boundary.

Mounting modules with `app.mount(module)` must not change or accumulate
the root `Gelis` type.

## Public API contracts

`defineContract()` creates the explicit public API boundary used by
future typed-client and OpenAPI tooling.

Example shape:

```ts
const health = app.get("/health", () => ({
  status: "ok",
}));

const users = defineModule("/users", (route) => ({
  list: route.get("/", listUsers),
  find: route.get("/:id", getUser),
}));

export const api = defineContract({
  health,
  users,
});

export type Api = typeof api;
```

`defineContract()` accepts only Gelis standalone `RouteRef` values and
Gelis modules.

The normalized contract view is available through:

```ts
type PublicApi = ApiContractOf<typeof api>;
```

Its shape is intentionally compact:

```text
PublicApi
├── health
│   └── route contract
└── users
    ├── list
    │   └── route contract
    └── find
        └── route contract
```

Module prefixes are not repeated in this normalized API view because
each contained route already carries its complete public path.

The contract does not contain:

- the root `Gelis` application type;
- handler function types;
- repositories;
- services;
- database types;
- runtime adapters;
- unrelated middleware implementation types.

The intended client boundary remains:

```ts
import type { Api } from "@server/api";

const client = createClient<Api>({
  baseUrl: "https://api.example.com",
});
```

The client consumes the compact `ApiContractRef` type rather than
`typeof app`.

This preserves a strict separation:

```text
backend implementation
        ↓
RouteRef / ModuleRef
        ↓
defineContract()
        ↓
public API contract
        ↓
typed client / OpenAPI / tooling
```

## Deliberately absent from core v0.1

- decorators/controllers
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
- typed-client result API
- WebSocket API
- plugin capability model
- response transformation semantics for schemas whose input and output differ
- duplicate public route detection across modules/contracts

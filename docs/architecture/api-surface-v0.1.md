# Gelis API Surface v0.1

**Status:** Active prototype — not frozen.

## Root application

The root application type remains stable.

Route registration returns compact `RouteRef` tokens and does not accumulate every route into the root `Gelis` generic type.

The portable request boundary is:

```ts
app.fetch(request);
```

returning:

```ts
Response | Promise<Response>;
```

## Runtime adapters

Server startup belongs to adapters rather than the portable core.

The Bun prototype currently exposes a thin `serve(app, options)` integration whose request path resolves to `app.fetch.bind(app)`.

The intended future published boundaries are:

```text
gelis
@gelis/client
@gelis/bun
```

after prototype APIs are stable enough to promote.

## Routes

Contract/options precede the handler.

Conceptually:

```ts
app.get(path, handler);

app.get(
  path,
  {
    query: QuerySchema,
    responses: {
      200: ResponseSchema,
    },
  },
  handler,
);
```

## Path syntax

v0.1 supports static segments and required named parameters such as `/:id`.

Optional parameters and wildcard/catch-all syntax remain deliberately unsupported until their runtime semantics are designed and benchmarked.

Paths must begin with `/`.

## RouteRef public contract

`RouteRef` carries compact normalized public information:

- method;
- full path;
- params;
- request query input;
- request body input;
- response status/output map.

It must not expose runtime handlers or backend implementation types.

## Standard Schema

For request schemas:

- public/client contracts use schema input;
- handlers receive schema output after validation/transformation.

Validation capability and OpenAPI/JSON-Schema serialization capability remain separate concerns.

## Query semantics

Raw query transport remains predictable:

```text
?page=2       -> "2"
?tag=a&tag=b  -> ["a", "b"]
```

Gelis does not guess number, boolean, JSON-object, or comma-array semantics. A schema may explicitly transform those values.

## Body semantics

The first body implementation treats a declared body schema as JSON input.

Accepted media types include:

- `application/json`;
- `application/*+json`.

Current input error semantics:

- malformed query encoding -> 400;
- malformed JSON -> 400;
- unsupported/missing JSON content type -> 415;
- schema issues -> 422.

These remain v0.1 prototype semantics until the public API freezes.

## Responses

Runtime normalization supports:

- `Response` passthrough;
- `undefined` -> 204;
- strings -> text;
- ordinary values -> JSON;
- `reply.status(status, body)` -> explicit status.

When explicit response contracts exist, `reply.status()` is typed against declared status/body pairs.

## Modules

`defineModule()` creates bounded route scopes.

Module prefixes and local route paths are combined before public path/param inference.

`app.mount(module)` registers runtime routes without growing the root app type.

## Public contracts

`defineContract()` creates the explicit API boundary used by typed clients and future tooling.

The contract excludes application implementation, handler types, repositories, services, database types, and runtime adapters.

## Typed client prototype

The typed client consumes compact API contracts rather than `typeof app`.

The prototype supports:

- named module methods;
- required params;
- query/body request typing from schema input;
- status-discriminated response unions;
- raw `Headers` and `Response` access.

The client projection has been benchmarked as lazy.

## Deliberately absent from core v0.1

- decorators/controllers;
- dependency injection;
- ORM;
- built-in schema DSL;
- reflection metadata;
- source inspection;
- route-chain-dependent root inference.

## Still open

- middleware API and onion semantics;
- framework error lifecycle;
- response-schema runtime validation policy;
- cookies core vs optional package;
- WebSocket API;
- plugin capability model;
- OpenAPI serialization boundary;
- final package layout.

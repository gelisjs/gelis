# Gelis Validation Architecture v0.1

**Status:** Correctness and plain-route regression accepted; comparative validation benchmark in progress.

## Goals

1. Plain routes pay no parsing or validation cost.
2. Synchronous Standard Schema validators remain synchronous.
3. Body parsing occurs only for routes declaring a body schema.
4. Query transport remains predictable.
5. Standard Schema output is supplied to handlers.
6. Core validation remains portable and Bun-independent.

## Execution plans

Route registration compiles required input work:

```text
plain       -> no input plan
query       -> query parse + validation
body        -> JSON parse + validation
query+body  -> query validation + JSON parse + body validation
```

Plain routes therefore do not enter a generic validation pipeline.

## Query semantics

```text
?page=2
-> { page: "2" }

?tag=a&tag=b
-> { tag: ["a", "b"] }

?q=hello+world
-> { q: "hello world" }
```

Gelis does not automatically convert string values into numbers, booleans, objects, or comma-separated arrays.

Schemas may explicitly transform/coerce them.

## Body semantics

The first implementation is JSON-focused.

Accepted media types:

- `application/json`;
- `application/*+json`.

Expected failures:

- malformed JSON -> 400;
- unsupported/missing JSON content type -> 415;
- validation issues -> 422.

## Validation errors

Current shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "target": "query",
    "issues": [
      {
        "message": "page is required",
        "path": ["page"]
      }
    ]
  }
}
```

The shape remains a v0.1 prototype contract.

## Sync Standard Schema fast path

Gelis calls:

```ts
schema["~standard"].validate(value);
```

and checks whether the result is promise-like.

A synchronous query schema can therefore stay on a synchronous request path.

An asynchronous schema uses a Promise continuation only when required.

JSON body reading itself is asynchronous.

## Correctness gate

Covered behavior:

- plain route remains synchronous;
- sync query parsing/validation;
- query validation errors;
- async query schemas;
- malformed query encoding;
- JSON body parsing/validation;
- malformed JSON;
- unsupported media type;
- query + body validation.

Milestone result:

```text
31 pass
0 fail
```

## Plain-route regression gate

Validation support was accepted only after re-benchmarking routes that declare no schema.

Latest same-machine HTTP run after validation remained healthy:

```text
Gelis static raw     16,349 req/s
Gelis dynamic raw    15,959 req/s
Gelis static JSON    16,105 req/s
Gelis dynamic JSON   15,913 req/s
```

## Current milestone

Validation Performance Benchmark v0.1 compares equivalent Standard Schema workloads across:

- Gelis;
- Hono + `@hono/standard-validator`;
- Elysia;
- Elysia precompile.

Cases:

- query-sync;
- query-async;
- body-sync;
- query-body.

The benchmark deliberately uses static routes so known dynamic-router differences do not contaminate validation integration results.

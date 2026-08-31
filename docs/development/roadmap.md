# Gelis Engineering Roadmap

**Status:** Active working roadmap  
**Current milestone:** Validation Performance Benchmark v0.1

This roadmap records engineering order, not release dates.

## North star

Build Gelis into a top-tier TypeScript backend framework with:

- very high throughput;
- low median and tail latency;
- scalable routing;
- low startup and memory cost;
- scalable TypeScript inference;
- strong contracts/client tooling;
- predictable semantics;
- Web Standards portability;
- runtime-specific optimization where justified.

Performance claims remain evidence-driven and fair.

## Completed foundations

### 1. Type-system architecture — accepted

- stable root `Gelis` type;
- local path inference;
- compact `RouteRef`;
- Standard Schema input/output distinction;
- typed status responses;
- bounded modules;
- explicit public contracts;
- typed-client prototype;
- 5,000-route compiler benchmarks;
- lazy client projection validated.

### 2. Portable runtime — accepted

- static exact routing;
- dynamic scanner trie;
- route precedence/fallback;
- module mount;
- 404;
- response normalization;
- duplicate detection;
- sync handler fast path;
- fast pathname extraction.

### 3. Portable runtime benchmark — accepted

Regression baseline established before validation/middleware work.

### 4. Real HTTP comparison — accepted as local baseline

Same-machine Bun/oha comparisons established against Hono 4.13.5 and Elysia 1.4.30.

### 5. Bun adapter prototype — accepted

- isolated Bun typing boundary;
- runtime tests;
- Bun option forwarding;
- request path uses `app.fetch.bind(app)`;
- negligible measured overhead.

### 6. Validation Architecture v0.1 — correctness accepted

- compiled input plans;
- plain fast path;
- predictable query transport;
- Standard Schema sync/async handling;
- JSON body path;
- validation errors;
- 31 runtime tests at the milestone.

### 7. Plain-route regression after validation — accepted

HTTP mixed-route benchmark showed no meaningful user-visible regression for routes without schemas.

## Current milestone

### 8. Validation Performance Benchmark v0.1 — in progress

Compare equivalent Standard Schema workloads across:

- Gelis;
- Hono + `@hono/standard-validator`;
- Elysia;
- Elysia precompile.

Use 5,000 static routes so known dynamic-router differences do not contaminate validation measurements.

Cases:

1. query-sync;
2. query-async;
3. body-sync;
4. query-body.

Acceptance process:

1. correctness;
2. same-machine throughput/latency/variance;
3. profile Gelis if it materially trails;
4. study competitor validation paths;
5. optimize measured costs only;
6. re-run plain-route regression.

## Next milestones

### 9. Validation optimization

Only if comparative results justify it.

Potential investigation areas:

- query parser allocation;
- input-plan specialization;
- validator dispatch;
- sync/async branching;
- body parsing integration;
- route-local precomputation.

### 10. Middleware/lifecycle architecture

Requirements:

- onion/compositional semantics;
- unattached middleware should cost nothing;
- preserve a plain fast path;
- bounded type growth;
- benchmark middleware and no-middleware routes separately.

### 11. Error lifecycle

Design expected errors, unexpected exceptions, validation errors, not-found behavior, and adapter/runtime errors without forcing every route through unnecessary generic machinery.

### 12. Response contracts and serialization

Resolve response validation, output transforms, serializers, and status/error contract behavior.

### 13. OpenAPI / contract serialization

Derive tooling from compact public contracts when schemas expose serializable metadata.

Keep runtime validation capability separate from OpenAPI serialization capability.

### 14. Typed client hardening

Measure declaration emission, package boundaries, IntelliSense latency, and real application contracts.

### 15. Additional runtime adapters

Potential Node and other Web Standard runtime targets.

### 16. Package promotion and repository restructuring

Current temporary structure:

```text
src/
prototype/
  client/
  bun/
```

After APIs stabilize:

```text
packages/
  gelis/
  client/
  bun/
```

with package-local source, tests, metadata, and tsconfig boundaries.

Do not migrate merely for cosmetic organization.

### 17. Broader benchmark matrix

Before broad public “fastest” claims:

- Linux;
- second machine;
- route-count sweep;
- concurrency sweep;
- startup;
- memory;
- body sizes;
- middleware;
- validation;
- error paths;
- realistic application composition.

## Optimization rule

```text
correctness
  ↓
baseline
  ↓
competitor architecture study
  ↓
profile
  ↓
optimize
  ↓
regression test
```

Avoid optimizing by intuition alone.

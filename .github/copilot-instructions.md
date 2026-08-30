# Gelis repository instructions

Gelis is a lightweight, inference-first TypeScript backend framework.

Its core identity is:

**FAST · LIGHT · TYPED · SCALABLE**

Scalability includes runtime scalability, codebase scalability,
and TypeScript compiler/editor scalability.

## Architecture rules

- Do not turn Gelis into a Hono, Elysia, Express, Fastify, or NestJS clone.
- Keep the root `Gelis` application type stable.
- Registering routes must not build one ever-growing generic application type.
- Prefer route-local and bounded type inference.
- Route registration should return a compact `RouteRef` contract token.
- Do not rely on fluent route chaining for application-wide type inference.
- Keep backend implementation types separate from public API contract types.
- Typed clients and OpenAPI tooling must consume compact contracts, not `typeof` the entire backend application.
- Use Web Standard primitives in core.
- Keep Bun-specific behavior out of core.
- Runtime-specific optimizations belong in adapters such as `@gelis/bun`.
- Preserve raw Web Standard `Request` and `Response` escape hatches.
- Prefer a functional and compositional core.
- Decorators and controllers may only exist as optional layers.
- Keep lifecycle primitives small.
- Prefer onion middleware plus a small explicit request pipeline.
- Request-local typed extensions belong under scoped `locals`.
- Do not globally mutate the root context type.
- Validation should be schema-agnostic and Standard Schema-friendly.
- Do not add a built-in schema DSL.
- Validation capability and OpenAPI/schema serialization capability are separate concepts.
- Do not parse request bodies unless explicitly required.
- Avoid source inspection.
- Avoid `Function#toString`.
- Avoid parameter-name inspection.
- Avoid runtime AST parsing.
- Avoid fragile reflection.
- Avoid AOT/code generation unless profiling later proves a concrete need.
- Avoid runtime dependencies in core unless there is a demonstrated technical reason.
- Target zero core runtime dependencies where realistic.

## Type-system rules

- Type-system performance is a first-class performance metric.
- Evaluate type-level features for:
  - TypeScript compilation time
  - editor and IntelliSense latency
  - declaration size
  - generic-instantiation complexity
- Design for synthetic applications containing:
  - 100 routes
  - 500 routes
  - 1,000 routes
  - 5,000 routes
- Avoid recursive conditional types when a simpler bounded representation is possible.
- Avoid distributive unions when they are unnecessary.
- Avoid `any` in public APIs.
- Prefer `unknown` and deliberate narrowing.
- Avoid unsafe type assertions unless the invariant is documented and tested.
- Path parameter inference must remain local to the route literal.
- Module boundaries should collapse implementation details into compact contracts.

## Current implementation phase

The repository is currently in the type-system prototype phase.

Do not implement a real HTTP router or server yet.

The first prototype must prove:

1. stable root `Gelis` typing
2. compact `RouteRef` contracts
3. path parameter inference
4. Standard Schema-compatible inference
5. status-specific typed responses
6. bounded `defineModule()` contracts
7. explicit `defineContract()` contracts
8. acceptable TypeScript performance at large route counts

Only after these properties have been measured should runtime routing
and runtime adapters be implemented.

## Coding style

- Use strict TypeScript.
- Prefer small focused modules.
- Keep public APIs minimal.
- Favor readable types over clever types.
- Comments should explain architectural reasons and invariants.
- Tests should contain positive type assertions.
- Use `@ts-expect-error` for intentional negative type tests.

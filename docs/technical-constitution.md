# Gelis Technical Constitution

**Status:** Draft v0.1

Gelis is a lightweight, inference-first TypeScript backend framework
designed for runtime speed and TypeScript scalability.

Its core identity is:

**FAST · LIGHT · TYPED · SCALABLE**

`SCALABLE` means:

- runtime scalability
- codebase scalability
- TypeScript scalability

## Principles

### 1. Performance is a feature, not a benchmark trick

Optimize real workloads and avoid fragile benchmark-only magic.

### 2. Type-system performance is framework performance

Measure TypeScript compilation and editor performance alongside
runtime performance.

### 3. Inference must be local and bounded

Routes infer locally.

Modules collapse implementation details into compact public contracts.

### 4. Contract and implementation are separate

Public API contracts must not expose database, repository, service,
runtime, or handler implementation types.

### 5. Web Standards form the core boundary

Core uses Web Standard primitives and preserves direct access to them.

### 6. Portable core, optimized adapters

Portable by contract, optimized by adapter.

### 7. Common cases must be effortless

Ergonomic by default, explicit when needed.

### 8. Few primitives, strong composition

Prefer a small pipeline and onion middleware over many lifecycle hooks.

### 9. Validation is first-class but validator-independent

Prefer Standard Schema compatibility.

Do not invent a Gelis-specific schema language.

### 10. One contract should power tooling

The same route contract should support validation, inference,
clients, OpenAPI, documentation, and code generation when possible.

### 11. Magic must justify its existence

Avoid source inspection, AST tricks, reflection, and AOT unless
profiling later proves they are necessary.

### 12. Keep core small

Target zero runtime dependencies where realistic.

## Functional core

Decorators and controllers may exist later as optional layers.

They are not core architecture.

## Lazy by default

Do not compute or parse request data that a route does not require.

## Decision test

Before adding a feature, ask:

1. Does it belong in core?
2. What is its runtime cost?
3. What is its type-system cost?
4. Could it be optional?
5. Does it add hidden magic?
6. Does it preserve Web Standard escape hatches?

# Gelis Technical Constitution

**Status:** Active v0.1

Gelis is an inference-first TypeScript backend framework designed for runtime speed, TypeScript scalability, portability, and predictable developer ergonomics.

**FAST · LIGHT · TYPED · SCALABLE**

## Principles

### Performance is a product feature

Optimize representative runtime workloads, latency distribution, startup, memory, and type-system cost. Do not sacrifice correctness for benchmark tricks.

### Study competitor architecture before optimizing

Understand why competing frameworks are fast and where their designs still pay cost. Benchmark hypotheses before changing Gelis architecture.

### Type-system performance is framework performance

Measure TypeScript instantiations, memory, check time, declaration size, and editor behavior alongside runtime performance.

### Inference must remain local and bounded

Routes infer locally. Modules and contracts collapse implementation details into compact public types. The root `Gelis` type must not grow with every route.

### Contract and implementation are separate

Public contracts must not expose handlers, services, repositories, databases, adapters, or unrelated runtime implementation types.

### Web Standards form the portable core boundary

Core uses standard primitives such as `Request`, `Response`, and `Headers`. Runtime-specific server startup belongs to adapters.

### Portable by contract, optimized by adapter

The core defines semantics. Adapters may use runtime-specific capabilities when profiling proves an advantage.

### Unused features should be close to zero-cost

Plain routes should not pay for body parsing, query parsing, schema validation, middleware, OpenAPI, or adapter features they do not use.

### Specialize hot paths

Prefer bounded execution plans over one generic request pipeline when specialization materially reduces cost.

### Validation is first-class but validator-independent

Prefer Standard Schema. Do not create a Gelis-only schema language. Keep transport parsing separate from schema transforms.

### Common cases must be effortless

Ergonomic by default, explicit when ambiguity matters. Avoid hidden coercion.

### Few primitives, strong composition

Prefer a small composable core. Controllers/decorators may exist later as optional layers.

### One contract should power tooling

Compact route contracts should support type inference, clients, OpenAPI, documentation, and code generation where possible.

### Magic must justify its existence

Avoid brittle source inspection, reflection-heavy routing, and code generation without evidence. JIT/AOT is allowed only when benchmarks justify its complexity and trade-offs.

### Keep core small

Target zero core runtime dependencies where realistic.

## Decision test

Before accepting a feature or optimization:

1. Does it belong in core?
2. What does an unused route pay?
3. What is its runtime cost?
4. What is its type-system cost?
5. Can it be specialized or moved to an adapter/package?
6. Does it preserve correctness?
7. Does it preserve Web Standard escape hatches?
8. Is the complexity supported by profiling?
9. How does the equivalent competitor architecture work?
10. Can the decision be benchmarked reproducibly?

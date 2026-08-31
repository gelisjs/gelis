# Gelis

> Experimental — pre-alpha framework engineering project.

Gelis is an inference-first TypeScript backend framework designed for high runtime performance, TypeScript scalability, portability, and predictable developer ergonomics.

**FAST · LIGHT · TYPED · SCALABLE**

## Current status

Validated so far:

- bounded route/module/public-contract typing up to 5,000 generated routes;
- lazy typed-client projection;
- portable Web Standards runtime;
- exact static routing plus scanner-based dynamic trie routing;
- synchronous handler fast path;
- response normalization and typed `reply.status()`;
- Bun adapter prototype with negligible measured overhead;
- Standard Schema query/body validation architecture;
- same-machine HTTP comparisons against Hono and Elysia.

Current milestone: **Validation Performance Benchmark v0.1**.

## Design direction

- portable by contract, optimized by adapter;
- unused features should be close to zero-cost;
- type-system performance is framework performance;
- runtime specialization is evidence-driven;
- benchmark competitor architectures, not marketing claims;
- preserve Web Standard escape hatches;
- avoid validator lock-in;
- avoid framework-wide generic accumulation.

## Development

```bash
bun install
bun run check
```

Benchmarks:

```bash
bun run bench:types
bun run bench:runtime
bun run bench:http
bun run bench:http:adapter
bun run bench:http:validation
```

## Engineering docs

- [`docs/architecture/technical-constitution.md`](docs/architecture/technical-constitution.md)
- [`docs/architecture/api-surface-v0.1.md`](docs/architecture/api-surface-v0.1.md)
- [`docs/architecture/runtime-v0.1.md`](docs/architecture/runtime-v0.1.md)
- [`docs/architecture/validation-v0.1.md`](docs/architecture/validation-v0.1.md)
- [`docs/development/roadmap.md`](docs/development/roadmap.md)
- [`docs/benchmarks/type-system-baseline-v0.1.md`](docs/benchmarks/type-system-baseline-v0.1.md)
- [`docs/benchmarks/runtime-baseline-v0.1.md`](docs/benchmarks/runtime-baseline-v0.1.md)
- [`docs/benchmarks/http-comparison-baseline-v0.1.md`](docs/benchmarks/http-comparison-baseline-v0.1.md)

## License

MIT

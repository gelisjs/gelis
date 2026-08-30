# Gelis

> Experimental — pre-alpha design and type-system prototype.

Gelis is a lightweight, inference-first TypeScript backend framework designed for runtime speed and TypeScript scalability.

**FAST · LIGHT · TYPED · SCALABLE**

The project is currently validating its type architecture before implementing the HTTP runtime.

## Current milestone

The first prototype must prove:

- stable root application typing;
- compact route contracts;
- local path-parameter inference;
- schema inference without validator lock-in;
- status-specific typed responses;
- bounded module contracts;
- explicit public API contracts;
- acceptable TypeScript performance at 100, 500, 1,000, and 5,000 routes.

See:

- [`docs/technical-constitution.md`](docs/technical-constitution.md)
- [`docs/api-surface-v0.1.md`](docs/api-surface-v0.1.md)

## Development

```bash
bun install
bun run check
```

## License

MIT

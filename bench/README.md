# Gelis Benchmarks

The benchmark suite is split by what it measures:

- `bench/types` measures TypeScript scalability by generating route fixtures, compiling them with `--extendedDiagnostics`, collecting multiple samples, and reporting medians.
- `bench/runtime` measures in-process Gelis runtime paths without network overhead.
- `bench/http` measures real HTTP servers across Gelis and comparison frameworks.

Benchmark tooling uses `.mts`: typed TypeScript ESM files executed directly by Bun.

HTTP benchmark entry points:

- `bench/http/run-oha.mts` is the official mixed-route HTTP baseline.
- `bench/http/run.mts` is the older diagnostic Autocannon baseline and remains available for historical checks.
- `bench/http/run-gelis-adapter.mts` measures the Bun adapter path.
- `bench/http/validation`, `bench/http/lifecycle`, `bench/http/global-lifecycle`, `bench/http/on-request`, and `bench/http/on-error` are feature-focused suites.

Runtime isolated benchmarks launch a fresh process per case to reduce JIT, GC, and execution-order contamination between cases.

Generated fixtures and raw results are not source artifacts. They are written under ignored `generated` and `results` directories.

Accepted and frozen benchmark conclusions live in `docs/benchmarks`.

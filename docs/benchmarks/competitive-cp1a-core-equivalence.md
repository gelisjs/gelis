# Competitive Performance v0.1 — CP1-A Core HTTP Equivalence

**Status:** ACCEPTANCE CANDIDATE — authoritative after Quality and the frozen-dependency equivalence workflow pass on the exact formatted tree  
**Protocol freeze:** `0cbaa9c7758aa92f6adcd6a289af4d7bcd88d58e`  
**Gelis production source:** `1dd5f94cf0e9ad884ca44e537ee287587cd8baab`

## Purpose

CP1-A proves semantic equivalence for the successful core HTTP workloads that CP2 will measure. It performs no timing and produces no performance ranking.

The source-runtime lanes are:

```text
raw Bun.serve routes reference
Gelis
Hono 4.13.7
Elysia 1.4.30 default
Elysia 1.4.30 precompile
Elysia 2.0.0-beta.14 source runtime
```

CP1-A2 adds a separate optimized lane:

```text
Elysia 2.0.0-beta.14 AOT build
```

The AOT lane is reported separately from Elysia 2 source runtime. Raw Bun remains a runtime ceiling/reference rather than a framework competitor.

## Frozen dependency identities

The source-runtime competitive dependency graph is isolated under `bench/competitive` and uses exact top-level versions plus its own `bun.lock`.

```text
Bun:          1.4.2
Hono:         4.13.7
Elysia:       1.4.30
Elysia next:  2.0.0-beta.14
```

Elysia 2 AOT uses a second dependency island under `bench/competitive/elysia-v2-aot`. That project installs the beta under its original package name:

```text
elysia: 2.0.0-beta.14
```

It has its own `bun.lock` so AOT internals cannot accidentally resolve the colocated Elysia 1.4 package.

The source-runtime probe also verifies that the repository `src` tree is identical to the frozen Gelis production source SHA before executing.

## Workloads

The four core cases are:

```text
static raw
dynamic raw
static JSON
dynamic JSON
```

The equivalence probes use three generated routes because route count does not alter the response contract being checked here. CP2 independently measures the frozen route-count matrix `1 / 100 / 1,000 / 5,000`.

For the static lane the representative request is:

```text
GET /r/1?probe=1
```

For the dynamic lane it is:

```text
GET /r/1/value-42?probe=1
```

The query string is intentional: route matching must be based on the path while preserving the same response semantics.

## Required equivalence

For every framework lane and case, CP1-A requires:

```text
HTTP status: 200
raw media type: text/plain
JSON media type: application/json
no content encoding
exact response body bytes
dynamic param value: value-42
```

Charset parameters on `Content-Type` are normalized away because the semantic media type is the compared property. No compression/content encoding is permitted in the frozen core workload.

Expected bodies are:

```text
static raw:   GET
dynamic raw:  value-42
static JSON:  {"method":"GET","route":1}
dynamic JSON: {"method":"GET","id":"value-42"}
```

## Source-runtime evidence

Initial CP1-A workflow run `34576680372` was not acceptance evidence. It stopped at harness typechecking because the diagnostic stderr helper accepted a narrower stream type than Bun's generic subprocess type exposed. No equivalence probe ran in that attempt.

The typing-only harness correction did not alter framework setup, request shape, response contract, or comparator behavior.

CP1-A workflow run `34576758192` then passed:

```text
exact dependency installation: PASS
competitive harness typecheck: PASS
core equivalence probe: PASS
```

All 24 source-runtime combinations returned the required status, media type, and exact response body bytes:

```text
6 framework lanes × 4 cases = 24/24 equivalent
```

The source-runtime dependency graph was then frozen into `bench/competitive/bun.lock`. Exact formatted validation commit `5eb53d6f0452fd24c48320e68009d9fb52d6ff5f` passed both the frozen-dependency CP1-A workflow and full repository Quality.

## Elysia 2 AOT evidence

The first beta.14 AOT attempt, workflow run `34577415861`, is retained as harness-invalid evidence. The build was launched from the source-runtime dependency island where Elysia 1.4 and the aliased Elysia 2 package coexist. Elysia 2 AOT internals resolved the bare `elysia` package to Elysia 1.4, producing an incompatible internal module graph:

```text
Elysia 2 compose.mjs expected ELYSIA_TRACE
Elysia 1.4 trace.mjs did not export that symbol
```

That failure is not classified as an Elysia 2 AOT product failure and is not performance evidence.

The harness was corrected by moving AOT into an isolated project where `elysia@2.0.0-beta.14` is installed under its original package name. No workload semantics changed.

Workflow run `34577679061` then passed:

```text
source-runtime 24/24 equivalence: PASS
isolated Elysia 2 AOT install: PASS
AOT harness typecheck: PASS
AOT build for all four cases: PASS
AOT runtime equivalence probe: PASS
```

The AOT probe returned the same required status, media type, and exact response bytes in all cases:

```text
Elysia 2 AOT × 4 cases = 4/4 equivalent
```

The generated AOT dependency graph was promoted to `bench/competitive/elysia-v2-aot/bun.lock`. Final CP1-A/CP1-A2 acceptance requires both dependency islands to install with `--frozen-lockfile`, both equivalence probes to pass, and repository Quality to pass on the exact formatted evidence tree.

## Interpretation boundary

CP1-A and CP1-A2 establish equivalence only for the successful core HTTP workloads described above. They do not establish equivalence for validation, body handling, production policy composition, startup/lifecycle, or memory checkpoints. Those lanes require their own CP1 sub-gates before their corresponding performance phases.

No CP1-A or CP1-A2 result is a performance claim.

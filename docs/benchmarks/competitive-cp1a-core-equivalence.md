# Competitive Performance v0.1 — CP1-A Core HTTP Equivalence

**Status:** ACCEPTANCE CANDIDATE — authoritative after Quality passes on the exact formatted tree  
**Protocol freeze:** `0cbaa9c7758aa92f6adcd6a289af4d7bcd88d58e`  
**Gelis production source:** `1dd5f94cf0e9ad884ca44e537ee287587cd8baab`

## Purpose

CP1-A proves semantic equivalence for the successful core HTTP workloads that CP2 will measure. It performs no timing and produces no performance ranking.

The measured source-runtime lanes are:

```text
raw Bun.serve routes reference
Gelis
Hono 4.13.7
Elysia 1.4.30 default
Elysia 1.4.30 precompile
Elysia 2.0.0-beta.14 source runtime
```

Elysia 2 AOT is intentionally treated as a separate optimized lane and requires its own equivalence proof before any AOT performance result is promotable.

## Frozen dependency identities

The competitive dependency graph is isolated under `bench/competitive` and uses exact top-level versions plus its own `bun.lock`.

```text
Bun:          1.4.2
Hono:         4.13.7
Elysia:       1.4.30
Elysia next:  2.0.0-beta.14
```

The probe also verifies that the repository `src` tree is identical to the frozen Gelis production source SHA before executing.

## Workloads

The four core cases are:

```text
static raw
dynamic raw
static JSON
dynamic JSON
```

The equivalence probe uses three generated routes because route count does not alter the response contract being checked here. CP2 independently measures the frozen route-count matrix `1 / 100 / 1,000 / 5,000`.

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

## Evidence

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

After the generated competitive lockfile was promoted into the repository, the workflow was changed to use `--frozen-lockfile`. Final CP1-A acceptance requires that same frozen-dependency probe plus repository Quality to pass on the formatted evidence tree.

## Interpretation boundary

CP1-A establishes equivalence only for the successful core HTTP workloads described above. It does not establish equivalence for validation, body handling, production policy composition, startup/lifecycle, memory checkpoints, or Elysia 2 AOT. Those lanes require their own CP1 sub-gates before their corresponding performance phases.

No CP1-A result is a performance claim.

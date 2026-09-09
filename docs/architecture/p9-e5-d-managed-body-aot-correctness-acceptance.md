# P9-E5-D Managed Request-Body AOT Correctness Acceptance

Status: ACCEPTED / FROZEN  
Phase: P9-E5-D  
Branch: `architecture/composition-v0.1`  
Correctness candidate: `3ba56b5eac9a602075c3d329951cdcd638cf1869`

## Scope

P9-E5-D validates semantic equivalence between normal managed request-body registration and the P9-E5-C flat/source AOT managed-input binding path.

The candidate adds correctness/equivalence coverage only. No runtime or tooling implementation source changed after the P9-E5-C freeze.

## Correctness gate

Executed by the user on Bun 1.4.0 after synchronizing to the candidate:

```text
581 pass
0 fail
1619 expect() calls
```

Result: PASS.

## Accepted coverage

The permanent P9-E5-D suite covers:

- JSON shorthand;
- explicit custom JSON media types and replacement semantics;
- text request bodies;
- URL-encoded request bodies;
- multipart request bodies including an empty field name;
- arrayBuffer request bodies;
- query + managed body routes;
- missing/wrong media type as 415;
- malformed accepted representation as 400;
- schema validation failure as 422;
- normal-registration versus AOT response equivalence;
- normal-registration versus AOT `inspectContract()` parser/media metadata parity;
- supported OpenAPI metadata preservation;
- fail-closed rejection of unsupported response contracts, opaque options, spread options, and lifecycle-bearing shapes;
- declaration-time options-before-handler evaluation ordering;
- post-declaration mutation cannot retroactively change the captured input plan;
- managed capture imports/sidecars are emitted only when needed;
- plain-only generated source remains zero-unused with respect to managed-input binding.

## Accepted invariants

1. AOT and normal registration converge on the same `createRuntimeInputPlan()` behavior.
2. Standard Schema objects and parser functions remain live source/runtime capabilities and are not serialized into the flat artifact.
3. The flat artifact remains topology-only.
4. Managed bindings remain joined to topology by stable route index.
5. Plain-only generated source does not allocate or import managed-input machinery.
6. Unsupported source shapes fail closed rather than silently dropping semantics.
7. The frozen P9-E2/P9-E3 request-body error taxonomy remains unchanged under AOT.
8. Contract/OpenAPI inspection parity is preserved for supported managed routes.

## Performance disposition

P9-E5-D is correctness-only. No performance result is used for acceptance here.

Proceed to P9-E5-E using the performance gates frozen in P9-E5-A before implementation results were observed.

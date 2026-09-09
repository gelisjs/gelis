# P9-E5-C Managed Request-Body AOT Binding Acceptance

Status: ACCEPTED / FROZEN  
Phase: P9-E5-C  
Branch: `architecture/composition-v0.1`  
Correctness candidate: `ffc16320e75f25ed568e4ad3b3ca56b94dd6acdd`

## Scope

P9-E5-C implements declaration-time managed request-body capture and flat AOT runtime binding while preserving the P9-E5-A architecture freeze.

The flat JSON artifact remains topology-only. Managed schemas, parser functions, compiled `RuntimeInputPlan` objects, handler functions, and OpenAPI capability references remain live generated-source/runtime bindings rather than serialized artifact data.

## Correctness gate

The candidate was executed by the user with:

```text
bun run check
```

Observed result:

```text
571 pass
0 fail
1571 expect() calls
```

Result: PASS.

## Accepted implementation invariants

1. Managed-body source AOT accepts only the frozen directly analyzable object-literal subset.
2. `body` is required for the managed-body AOT subset.
3. `query`, `bodyParser`, `bodyContentTypes`, and `openapi` may accompany the managed body.
4. Unknown options, computed keys, spreads, opaque options expressions, response contracts, and unsupported executable route capabilities remain fail-closed.
5. Managed options and handler expressions are captured at the original route declaration position.
6. Managed input compilation reuses `createRuntimeInputPlan()`; P9-E5 does not introduce a second request parser compiler.
7. Plain-only rewritten source emits no managed-input sidecar.
8. A managed/mixed generated source uses route index as the join key between topology, handlers, and the optional managed-input sidecar.
9. The flat artifact version and topology representation remain unchanged.
10. Identical method/path/order topology produces the same flat artifact regardless of whether runtime bindings are plain or managed.
11. The existing plain flat-route binder remains specialized and unchanged by a per-route managed-input check.
12. Managed/mixed installation uses a separate binding path which reconstructs runtime records with `RUNTIME_ROUTE_INPUT` and the captured `RuntimeInputPlan`.
13. Managed AOT-installed routes enter the ordinary Gelis request execution path; there is no AOT-specific request-body parser branch.
14. Supported OpenAPI route metadata is preserved through managed AOT capture and contract inspection.
15. `inspectContract()` projects the same body schema/parser/media metadata from AOT-installed managed routes as from normally registered routes.

## Permanent coverage added in P9-E5-C

`test/runtime/aot-managed-input-binding.test.ts` covers:

- managed declaration-time sidecar rewrite;
- zero-unused plain source rewrite;
- topology artifact equality between plain and managed bindings;
- mixed plain + managed runtime installation;
- managed text parsing and schema transform;
- unsupported media returning 415;
- body/parser/media/OpenAPI contract projection after AOT install.

## Performance disposition

No performance result is accepted in P9-E5-C.

The P9-E5-A performance gates remain frozen and must be executed only after the comprehensive P9-E5-D correctness/equivalence suite passes.

## Next phase

Proceed to P9-E5-D: comprehensive AOT correctness/equivalence coverage for every accepted built-in request-body parser and frozen failure/evaluation semantics.

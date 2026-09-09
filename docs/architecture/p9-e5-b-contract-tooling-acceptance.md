# P9-E5-B Managed Request-Body Contract / Tooling Acceptance

Status: ACCEPTED / FROZEN  
Phase: P9-E5  
Branch: `architecture/composition-v0.1`  
Architecture freeze: `f90fba63b39ae72a89c48ab3b02047f2313d7e00`  
Correctness candidate: `0401704dcdcac449bfff9f3809937e37b9c88bf0`

## Scope

P9-E5-B closes the contract/tooling projection portion of the P9-E5 architecture freeze.

`inspectContract()` now projects the effective managed request-body parser metadata already retained by the compiled `RuntimeInputPlan`:

```ts
readonly bodyParser: RequestBodyParser | undefined;
readonly bodyContentTypes: readonly string[] | undefined;
```

No request-time parser interpretation was added.

## Accepted semantics

The frozen projection semantics are:

```text
no managed body
→ bodyParser: undefined
→ bodyContentTypes: undefined

{ body: schema } JSON shorthand
→ bodyParser: "json"
→ bodyContentTypes: undefined

explicit parser
→ bodyParser: effective parser literal

explicit bodyContentTypes
→ bodyContentTypes: normalized / deduplicated media essences
```

The projected explicit media-type array is copied during inspection so callers do not receive the internal `RuntimeInputPlan` array reference.

The existing query/body schema references remain capability references and are not executed by inspection.

## Permanent coverage

P9-E5-B adds/updates permanent coverage in:

```text
test/runtime/contract-body-parser-metadata.test.ts
test/runtime/contract-source.test.ts
test/runtime/module-contract-compatibility.test.ts
```

Coverage includes:

1. plain routes project no parser/media metadata;
2. JSON body shorthand projects `bodyParser === "json"`;
3. explicit text parser projects the effective parser;
4. explicit media aliases are normalized and deduplicated;
5. repeated `inspectContract()` calls return distinct explicit media arrays;
6. mounted/scoped module contracts preserve the same parser metadata;
7. QUERY request-body contracts preserve the same parser metadata;
8. existing contract snapshots keep their established field isolation behavior.

## Correctness gate

The final candidate was executed by the user with:

```text
bun run check
```

Observed result:

```text
567 pass
0 fail
1549 expect() calls
```

Result: PASS.

An intermediate run exposed one stale `Object.keys()` expectation in the existing module contract compatibility suite. The runtime implementation was not changed to resolve it; the permanent compatibility test was updated to reflect the intentionally enlarged `ContractRouteSnapshot` shape. The final run above is the acceptance result.

## Performance / type-scaling disposition

P9-E5-B adds inspection-time projection only. It does not add request-time work.

The P9-E5 architecture freeze states that the existing P9-E2 TypeScript scaling acceptance remains authoritative when route-level generics are unchanged. P9-E5-B does not change `RouteOptionsFor`, `RouteRef`, handler inference, or other route generic growth.

Therefore no new TypeScript scaling benchmark is required for P9-E5-B.

This is not a performance improvement claim.

## Result

P9-E5-B is complete and frozen.

Proceed to P9-E5-C: managed-input source capture and flat AOT runtime binding while preserving the topology-only artifact and plain-only zero-unused path.

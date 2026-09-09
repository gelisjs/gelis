# P9-E5-F Managed Request-Body AOT Acceptance

Status: ACCEPTED / FROZEN  
Phase: P9-E5-F  
Branch: `architecture/composition-v0.1`  
Final candidate: `697d0cc37e8231849425a3f2f111eef997ef33e4`  
Frozen implementation control: `f2d2666e0c38c39a29d13163da597676c0d9637c`

## Scope

P9-E5 closes the managed request-body AOT/tooling gap while preserving the architecture frozen in P9-E5-A:

- the flat AOT artifact remains topology-only;
- Standard Schema objects, parser functions, handlers, and `RuntimeInputPlan` remain live source/runtime capabilities;
- managed request options are captured at original declaration position;
- normal registration and AOT converge on the same `createRuntimeInputPlan()` implementation;
- plain-only generated source remains free of managed-input sidecar machinery;
- no AOT-specific request-body branch is added to the request hot path;
- contract inspection exposes effective parser/media metadata for normal and AOT routes.

P9-E5-B through P9-E5-D established contract projection, managed source/runtime binding, and full semantic equivalence. P9-E5-E then applied the performance gates frozen before implementation results were observed.

## Final correctness gate

Executed by the user on Bun 1.4.0 after the startup-size optimization candidate was applied:

```text
582 pass
0 fail
1626 expect() calls
Ran 582 tests across 72 files.
```

Result: PASS.

The final optimization adds only compact generated-source aliases plus permanent collision coverage. It does not change request execution, the runtime input-plan compiler, flat artifact representation, or public route generics.

## Performance environment

```text
Runtime: Bun 1.4.0
CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
```

All acceptance thresholds below are the thresholds frozen in P9-E5-A before implementation results.

## Plain AOT zero-unused acceptance

Control:

```text
f2d2666e0c38c39a29d13163da597676c0d9637c
```

Candidate:

```text
697d0cc37e8231849425a3f2f111eef997ef33e4
```

Protocol:

```text
5,000 routes/profile
profiles: static, trailing, mixed-balanced
31 samples/orientation
fresh process per scenario/sample
control→candidate and candidate→control orientations
```

Final summary:

| profile | ready ratio | first-fetch ratio | RSS ratio | artifact | version | zero-unused | verdict |
| --- | ---: | ---: | ---: | --- | --- | --- | --- |
| static | 0.9791x | 0.9867x | 1.0012x | exact | exact | yes | PASS |
| trailing | 0.9659x | 0.9867x | 1.0084x | exact | exact | yes | PASS |
| mixed-balanced | 0.9768x | 1.0029x | 1.0020x | exact | exact | yes | PASS |

Aggregate:

```text
ready geomean = 0.9739x  (gate <= 1.03x)  PASS
first geomean = 0.9921x  (gate <= 1.03x)  PASS
```

All per-profile ready, first-fetch, and RSS gates pass.

Negative ratios are treated only as no-regression evidence; they are not accepted as general speedup claims.

## Artifact zero-unused acceptance

For all required plain profiles:

```text
artifact JSON bytes: exact
artifact version:    exact
managed sidecar:     absent
managed capture import: absent
```

Result: PASS.

`FLAT_AOT_ARTIFACT_VERSION` remains unchanged because the artifact representation remains topology-only.

## Managed request-path parity acceptance

Protocol:

```text
5,000 POST routes
41 mirrored samples/workload
4 persistent processes/workload
normal/AOT + AOT/normal orientations
semantic ABBA / BAAB
10,000 warmup app.fetch calls/worker
20,000 measured calls/measurement
Bun.gc(true) inside measured worker
```

Final summary:

| workload | mirrored AOT/normal delta | gate | verdict |
| --- | ---: | ---: | --- |
| JSON shorthand | -7.91% | <= +3% | PASS |
| query + JSON | +0.64% | <= +3% | PASS |
| multipart | +0.27% | <= +3% | PASS |

Order buckets remain diagnostic only.

The negative JSON result is no-regression evidence only and is not accepted as a framework speedup claim.

## Managed startup usefulness acceptance

Protocol:

```text
5,000 managed JSON POST routes
31 samples/orientation
fresh Bun process per scenario/sample
normal→AOT and AOT→normal orientations
build-time compilation excluded from module-ready measurement
```

Frozen gate:

```text
AOT ready / normal ready <= 1.05x
```

### Rejected v1

The first P9-E5-E candidate produced:

```text
normal module: 258 KB
AOT module:    463.7 KB
ready ratio:   1.0889x
```

Result: FAIL.

The gate was not relaxed.

Diagnosis showed repeated long generated managed-binding identifiers materially inflated the 5,000-route source module.

### Accepted v2

The final candidate compacts only repeated generated-source references while preserving canonical internal bindings and collision checks.

Final result:

```text
normal module:      258 KB
AOT module:         249 KB
AOT artifact:       128.7 KB
ready ratio:        1.0307x
first-fetch ratio:  0.9444x   diagnostic only
RSS ratio:          0.9788x   diagnostic only
```

Result: PASS.

The accepted improvement is specifically a generated-source size/startup fix. It does not change managed request execution semantics.

## TypeScript scaling disposition

P9-E5 did not add parser/media metadata to route generics and did not modify `RouteOptionsFor`, `RouteRef`, handler inference, or another route-level generic surface.

Therefore the frozen P9-E2 TypeScript scaling acceptance remains authoritative. No new 100→5,000 route scaling run is required for P9-E5.

## Shared request-body regression disposition

The final P9-E5 candidate does not modify the shared normal managed-body request execution path or `createRuntimeInputPlan()` semantics.

Therefore the cumulative P9-E3 candidate/control regression suite anchored at `313adf97932a80b95b1d2e4f0f27039a51e74013` is not required to be rerun for this acceptance.

If later work modifies that shared path, the P9-E3 control remains authoritative.

## Frozen accepted invariants

1. The flat artifact remains topology-only and version-stable.
2. Standard Schema/runtime capability objects are never serialized into the artifact.
3. Route index remains the join key between topology, handlers, and optional managed-input bindings.
4. Managed options are evaluated and captured at declaration time.
5. Normal registration and AOT use the same runtime input-plan compiler.
6. Plain-only AOT remains zero-unused for managed-input machinery.
7. Unsupported managed source shapes fail closed.
8. JSON, custom JSON media, text, URL-encoded, multipart, arrayBuffer, query+body, and 415/400/422 semantics remain equivalent under AOT.
9. Contract/OpenAPI parser metadata parity is preserved.
10. Managed AOT request-path overhead satisfies the frozen <= +3% representative-workload gate.
11. Managed AOT startup satisfies the frozen <= 1.05x usefulness gate.
12. The failed v1 startup candidate remains rejected; acceptance is based on the measured v2 final candidate.

## Phase disposition

P9-E5 is COMPLETE.

```text
P9-E5-A  architecture + gates freeze                 ACCEPTED
P9-E5-B  contract/tooling parser metadata parity     ACCEPTED
P9-E5-C  managed-input source capture + binding      ACCEPTED
P9-E5-D  correctness/equivalence                     ACCEPTED
P9-E5-E  performance gates                           ACCEPTED
P9-E5-F  acceptance freeze                           ACCEPTED
```

Next macro phase: P9-F large endpoint performance gate.

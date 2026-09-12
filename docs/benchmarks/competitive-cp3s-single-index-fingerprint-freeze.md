# Competitive Performance v0.1 — CP3-S single-index fingerprint freeze

## Purpose

CP3-R validated the production-shape trailing-prefix fingerprint mechanism on Bun 1.4.2. Runtime behavior was favorable: static stayed inside the frozen guard, mixed trailing dynamic improved materially, generic dynamic stayed neutral, pipeline gains survived response construction, collision fallback stayed bounded, and registration remained inside its gate. CP3-R nevertheless failed because retained router heap increased to `1.9163x` production.

The CP3-R candidate stores every normal trailing route in two indexes at once:

- canonical `Map<string, TrailingParamRoute>`;
- fingerprint `Map<number, TrailingFingerprintEntry>`.

CP3-S tests whether normal runtime registration can use the fingerprint structure as the sole trailing-route index while retaining the canonical string map only as a compatibility fallback for prebuilt/AOT/snapshot method tables that do not contain the fingerprint sidecar.

This is a storage-layout optimization only. It must not weaken exactness or move work onto the exact-static path.

## Frozen references

Production source:

`8e43aad09759d60378b3fc174292850057ccfba3`

CP3-R production-shape candidate source:

`bda7c0668c38b45bb37afaea72f0b923eb37d64b`

CP3-R authoritative harness head:

`ab279ab1db2fbe818798e18fb921464a870b2bb2`

CP3-R authoritative outcome:

- mixed static request: `1.0156x` — PASS
- mixed trailing dynamic request: `0.8534x` — PASS
- generic multi-param dynamic request: `1.0072x` — PASS
- pipeline geomean: `0.9696x` — PASS
- forced-collision fallback: `1.0899x` — PASS
- trailing-route registration: `1.4392x` — PASS
- retained router heap delta: `1.9163x` — FAIL

CP3-R is retained as a valid authoritative FAIL. It must not be rerun merely because the result was unfavorable.

## Candidate rules

The CP3-S candidate must preserve these properties:

1. Exact static lookup remains first and unchanged in routing precedence.
2. Normal runtime trailing-route registration stores routes in the fingerprint index without also inserting the same route into the canonical string map.
3. Fingerprint matching remains exact, not probabilistic:
   - find the final slash;
   - compute the frozen fixed-cost fingerprint;
   - integer lookup;
   - verify prefix length plus `startsWith()` on unique entries;
   - use an exact string map only inside a collided fingerprint bucket;
   - decode/materialize the final parameter exactly as before.
4. Duplicate trailing-prefix registration must be rejected directly by the fingerprint structure.
5. Existing method tables that contain `trailingParamRoutes` but no fingerprint sidecar must continue to use the canonical string-map fallback. This preserves AOT/snapshot compatibility in this phase.
6. Generic multi-parameter routes keep the existing trie implementation.
7. Migration from trailing-only mode to generic trie mode must migrate whichever single trailing index the table owns and then release it.
8. Transactional `registerBatchAtomic()` cloning must clone only the trailing index that actually exists.
9. No benchmark-specific branch may be introduced into production matching code.

## Correctness scope

Before authoritative timing, the probe must cover both frozen production and CP3-S candidate for:

- exact static precedence;
- trailing parameter extraction;
- arbitrary final parameter names;
- percent decoding;
- method isolation;
- duplicate trailing-prefix rejection;
- generic multi-parameter routing;
- migration from trailing-only mode into generic trie mode;
- `matchingMethods()`;
- transactional batch registration behavior;
- forced fingerprint collision exactness;
- trailing registration cell correctness;
- retained-memory cell correctness.

Full repository Quality must also pass before local timing.

## Protocol

CP3-S deliberately preserves the CP3-R measurement protocol so the storage change is compared under the same gates:

- Runtime: Bun `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Production comparator: exact source `8e43aad09759d60378b3fc174292850057ccfba3`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Warmup: `20,000` operations for ns/op cells
- Timed target: approximately `120 ms` after calibration
- clean worktree required
- temporary production worktree must be removed and pruned in `finally`

Timed cells remain:

1. mixed static request
2. mixed trailing dynamic request
3. generic multi-param dynamic request
4. string pipeline
5. JSON pipeline
6. forced fingerprint collision request
7. trailing-route registration
8. retained router heap delta

## Frozen gates

The gates are intentionally unchanged from CP3-R. No threshold is relaxed after the CP3-R memory failure.

| gate                                | candidate / production limit |
| ----------------------------------- | ---------------------------: |
| mixed static request                |                 `<= 1.0200x` |
| mixed trailing dynamic request      |                 `<= 0.9000x` |
| generic multi-param dynamic request |                 `<= 1.0300x` |
| string/JSON pipeline geomean        |                 `<= 0.9800x` |
| forced-collision fallback           |                 `<= 1.1500x` |
| trailing-route registration         |                 `<= 1.7500x` |
| retained router heap delta          |                 `<= 1.5000x` |

All seven gates must pass.

## Interpretation

- A valid unfavorable run is retained and is not repeated because a gate failed.
- Passing the memory gate is necessary but not sufficient; CP3-S must retain the runtime wins and static/generic guards simultaneously.
- PASS permits HTTP and broader competitive revalidation before any production promotion.
- FAIL means the single-index representation is not yet a production-worthy replacement and the failing dimension must be decomposed without moving the frozen gates.

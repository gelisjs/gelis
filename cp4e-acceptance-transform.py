from pathlib import Path

OLD = "5d9e5672031ff0ec468052f1d82c55e10b5387d7"
NEW = "f18e1131379f644ecdaf11132dceb2a8965fa430"

acceptance_src = Path("bench/runtime/cp4d-static-length-range-acceptance.mts")
acceptance_dst = Path("bench/runtime/cp4e-deferred-trailing-metadata-acceptance.mts")
worker_src = Path("bench/runtime/cp4d-static-length-range-worker.mts")
worker_dst = Path("bench/runtime/cp4e-deferred-trailing-metadata-worker.mts")

acceptance = acceptance_src.read_text()
acceptance = acceptance.replace(OLD, NEW)
acceptance = acceptance.replace(
    "cp4d-static-length-range-worker.mts",
    "cp4e-deferred-trailing-metadata-worker.mts",
)
acceptance = acceptance.replace("gelis-cp4d-production-", "gelis-cp4e-production-")
acceptance = acceptance.replace("CP4-D", "CP4-E")
acceptance = acceptance.replace(
    "Competitive Performance v0.1 — CP4-E static path-length range candidate",
    "Competitive Performance v0.1 — CP4-E deferred trailing-metadata candidate",
)
acceptance = acceptance.replace(
    "Frozen CP4-E static length-range gates",
    "Frozen CP4-E deferred trailing-metadata gates",
)
acceptance = acceptance.replace(
    "CP4-E STATIC LENGTH-RANGE GATE",
    "CP4-E DEFERRED TRAILING-METADATA GATE",
)
acceptance = acceptance.replace(
    "CP4-E LOCAL STATIC LENGTH-RANGE RUN: COMPLETE",
    "CP4-E LOCAL DEFERRED TRAILING-METADATA RUN: COMPLETE",
)
acceptance_dst.write_text(acceptance)

worker = worker_src.read_text().replace("cp4d-", "cp4e-")
worker_dst.write_text(worker)

Path("docs/benchmarks/competitive-cp4d-local-authoritative.md").write_text('''# Competitive Performance v0.1 — CP4-D local authoritative result

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `42ad2a7e462fe4879f7f3854053d24c4dc7b9b5a`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-D source: `5d9e5672031ff0ec468052f1d82c55e10b5387d7`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Correctness probe: `PASS (24/24)`

## Authoritative cells

| cell | variant | median | p25 | p75 | min | max | unit |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| static-only-raw | production | 785.0 | 773.3 | 807.6 | 770.6 | 1098.4 | ns/op |
| static-only-raw | candidate | 822.2 | 813.4 | 866.6 | 796.6 | 1202.1 | ns/op |
| mixed-static-raw | production | 802.8 | 792.3 | 822.0 | 773.6 | 848.7 | ns/op |
| mixed-static-raw | candidate | 813.3 | 804.8 | 830.5 | 793.9 | 848.1 | ns/op |
| mixed-dynamic-raw | production | 958.3 | 945.6 | 971.5 | 937.7 | 1042.4 | ns/op |
| mixed-dynamic-raw | candidate | 886.8 | 871.2 | 902.1 | 855.6 | 930.6 | ns/op |
| mixed-dynamic-json | production | 744.2 | 726.0 | 751.8 | 713.5 | 819.9 | ns/op |
| mixed-dynamic-json | candidate | 680.3 | 674.0 | 694.9 | 651.3 | 743.2 | ns/op |
| mixed-same-length-dynamic-raw | production | 945.6 | 929.7 | 956.6 | 924.9 | 995.7 | ns/op |
| mixed-same-length-dynamic-raw | candidate | 964.3 | 947.8 | 969.4 | 930.6 | 976.0 | ns/op |
| trailing-dynamic-raw | production | 975.4 | 955.2 | 983.4 | 943.1 | 1052.6 | ns/op |
| trailing-dynamic-raw | candidate | 881.0 | 864.5 | 898.3 | 853.5 | 937.4 | ns/op |
| trailing-dynamic-json | production | 785.7 | 763.9 | 819.5 | 726.6 | 941.9 | ns/op |
| trailing-dynamic-json | candidate | 725.2 | 686.7 | 749.3 | 659.5 | 794.9 | ns/op |
| generic-dynamic-raw | production | 1162.9 | 1154.1 | 1180.3 | 1128.1 | 1194.0 | ns/op |
| generic-dynamic-raw | candidate | 1181.7 | 1174.8 | 1194.0 | 1134.6 | 1258.6 | ns/op |
| collision-dynamic-raw | production | 1021.9 | 1013.2 | 1039.0 | 1003.5 | 1068.8 | ns/op |
| collision-dynamic-raw | candidate | 964.4 | 959.3 | 984.8 | 944.9 | 1057.7 | ns/op |
| all-dynamic-raw | production | 966.0 | 954.8 | 1008.7 | 934.4 | 1052.4 | ns/op |
| all-dynamic-raw | candidate | 901.3 | 873.7 | 905.8 | 860.9 | 962.8 | ns/op |
| static-registration | production | 1.244 | 1.235 | 1.385 | 1.211 | 1.695 | ms |
| static-registration | candidate | 1.292 | 1.222 | 1.326 | 1.117 | 1.378 | ms |
| static-memory | production | 619117 | 619117 | 619453 | 619117 | 620269 | bytes |
| static-memory | candidate | 617934 | 617934 | 618046 | 617902 | 618382 | bytes |

## Candidate / production ratios

| comparison | ratio | candidate delta |
| --- | ---: | ---: |
| static-only raw | `1.0474x` | `+37.2 ns` |
| mixed static raw | `1.0131x` | `+10.5 ns` |
| mixed dynamic raw | `0.9254x` | `-71.5 ns` |
| mixed dynamic JSON | `0.9142x` | `-63.9 ns` |
| mixed same-length dynamic raw | `1.0198x` | `+18.7 ns` |
| pure trailing dynamic raw | `0.9032x` | `-94.5 ns` |
| pure trailing dynamic JSON | `0.9230x` | `-60.5 ns` |
| generic dynamic raw | `1.0162x` | `+18.8 ns` |
| forced collision raw | `0.9437x` | `-57.5 ns` |
| ALL dynamic raw | `0.9331x` | `-64.6 ns` |
| static registration | `1.0389x` | `+0.048 ms` |
| static retained heap delta | `0.9981x` | `-1183 bytes` |

The mixed dynamic geomean was `0.9198x`.

## Frozen gate result

All frozen CP4-D gates passed except `static-only raw`:

- `static-only raw`: `1.0474x` versus required `<= 1.0200x` — **FAIL**.
- Every other frozen gate — including mixed static, mixed dynamic raw/JSON, same-length precedence, pure trailing raw/JSON, generic, forced collision, ALL, registration, and retained heap — **PASS**.

The gate was not changed and the authoritative run was not repeated merely because the result was unfavorable.

## Interpretation

1. The min/max static-length range preserves the desired negative-discrimination mechanism: mixed length-miss reaches `0.9254x` raw and `0.9142x` JSON versus production.
2. Exact-static precedence remains protected: the same-length dynamic cell stays within the frozen guard at `1.0198x`.
3. Constant-size min/max metadata materially improves the representation tradeoff relative to CP4-C's `Set<number>`: retained heap is effectively neutral (`0.9981x`) and static registration remains within the frozen `1.0500x` guard at `1.0389x`.
4. Pure trailing performance remains strong (`0.9032x` raw, `0.9230x` JSON), so the full-request-URL offset mechanism remains valuable.
5. The production candidate is rejected because the pure-static hot path regresses to `1.0474x`. CP4-E therefore isolates the lane-selection cost by deferring trailing metadata reads until after the static lookup while retaining the CP4-D range representation.

## Classification

**CP4-D LOCAL STATIC PATH-LENGTH RANGE: VALID / AUTHORITATIVE / REJECTED AS PRODUCTION CANDIDATE / ACCEPTED AS DECOMPOSITION EVIDENCE.**
''')

Path("docs/benchmarks/competitive-cp4e-deferred-trailing-metadata-freeze.md").write_text('''# Competitive Performance v0.1 — CP4-E deferred trailing-metadata acceptance freeze

## Purpose

CP4-E tests whether CP4-D's static-only regression comes from selecting the pure-static lane by eagerly reading trailing-route metadata before exact static lookup.

CP4-D established that the constant-size min/max static-length range preserves the mixed length-miss and pure-trailing wins while keeping registration and retained memory inside the frozen guards. CP4-D was nevertheless rejected because `static-only raw` regressed to `1.0474x` against a `<= 1.0200x` gate.

CP4-E keeps the CP4-D range representation and routing semantics but defers trailing metadata reads until after the range-gated exact static lookup. This is an acceptance gate for the frozen CP4-E source candidate.

## Frozen identities

- Previous production source: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-E candidate source: `f18e1131379f644ecdaf11132dceb2a8965fa430`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes per workload: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair

## Candidate shape

Relative to CP4-D, CP4-E changes only hot-path ordering in `matchRequestUrl()`:

1. generic-trie tables retain the established early materialized-pathname fallback;
2. full-request URL offsets are parsed for fast-map tables;
3. the min/max static pathname-length range is evaluated before trailing-route metadata is read;
4. when an exact static match remains possible, the canonical pathname substring + static `Map` lookup runs first and a static hit returns immediately;
5. only after the static lookup/miss does the fast-map lane read `trailingParamFingerprints` and `trailingParamRoutes`;
6. mixed requests whose pathname length lies outside the complete static range still skip static pathname materialization before trailing fingerprint matching;
7. legacy or prebuilt tables without range metadata conservatively retain canonical exact-static lookup;
8. trailing fingerprint matching, collision fallback, ALL semantics, generic routing, registration metadata, and retained-memory representation are otherwise unchanged from CP4-D.

The optimization is intentionally an ordering change, not a semantic shortcut. Exact static precedence remains mandatory whenever an exact static route can exist.

## Frozen cells

The cell set and worker semantics are unchanged from CP4-D. Every request timing cell runs the complete variant-specific `Gelis.fetch()` stack.

1. `static-only-raw`: 5,000 static GET routes; guards the pure-static hit path that CP4-E specifically targets.
2. `mixed-static-raw`: 2,500 static + 2,500 trailing-param GET routes; requests an exact static route.
3. `mixed-dynamic-raw`: same mixed topology; dynamic pathname length lies outside the installed static range.
4. `mixed-dynamic-json`: same mixed length-miss topology returning JSON.
5. `mixed-same-length-dynamic-raw`: static and dynamic request lengths are deliberately equal, forcing canonical exact-static precedence lookup.
6. `trailing-dynamic-raw`: 5,000 trailing-param routes and no static routes.
7. `trailing-dynamic-json`: same pure trailing topology returning JSON.
8. `generic-dynamic-raw`: 5,000 generic multi-param routes.
9. `collision-dynamic-raw`: 5,000 same-length trailing prefixes sharing the fingerprint suffix.
10. `all-dynamic-raw`: 5,000 ALL trailing-param routes requested with PATCH.
11. `static-registration`: registers 5,000 static routes into a fresh Router.
12. `static-memory`: measures retained heap delta for 5,000 static routes after forced GC.

Request URLs include query strings where relevant, preserving `pathEnd` coverage.

## Timing protocol

The CP4-D protocol is retained without relaxation:

- 11 mirrored fresh-worker samples per cell pair;
- production/candidate order alternates by sample;
- one measured cell and variant per worker;
- 20,000 warmup operations for nanosecond request cells;
- calibration floor `20 ms`;
- target measured duration approximately `120 ms`;
- registration and retained-memory cells use one isolated measurement per fresh worker after correctness/warmup setup;
- report median, p25, p75, min and max;
- correctness probe must pass before authoritative timing;
- the exact detached production worktree is removed and `git worktree prune` runs after every invocation.

## Frozen gates

All CP4-D limits are retained exactly. No threshold is loosened for CP4-E.

| gate | candidate / production limit | rationale |
| --- | ---: | --- |
| static-only raw | `<= 1.0200x` | pure-static routing must not materially regress |
| mixed static raw | `<= 1.0200x` | mixed-table static exact hits must remain practical |
| mixed dynamic raw guard | `<= 1.0200x` | no material raw regression |
| mixed dynamic JSON guard | `<= 1.0200x` | no material JSON regression |
| mixed dynamic geomean | `<= 0.9800x` | mixed tables must gain materially on average |
| mixed same-length dynamic raw | `<= 1.0200x` | exact-static precedence fallback must remain near parity |
| pure trailing dynamic raw | `<= 0.9400x` | retain a substantial real-app raw offset win |
| pure trailing dynamic JSON | `<= 0.9500x` | retain a substantial real-app JSON offset win |
| generic dynamic raw | `<= 1.0300x` | generic-trie fallback guard |
| forced collision raw | `<= 1.1500x` | collision fallback guard |
| ALL dynamic raw | `<= 1.0500x` | method-semantics fallback guard |
| static registration | `<= 1.0500x` | range maintenance must remain cheap |
| static retained heap | `<= 1.0500x` | constant-size metadata must remain memory-neutral in practice |

The mixed dynamic geomean is `sqrt(mixedRawRatio * mixedJsonRatio)`.

No gate may be changed after the first valid authoritative local timing run.

## Classification

- Probe failure before timing: fix correctness/harness and classify the unusable run INVALID.
- Valid timing with every frozen gate PASS: CP4-E ACCEPTED and eligible for HTTP revalidation before promotion.
- Valid timing with any frozen gate FAIL: CP4-E FAIL. Do not rerun merely because the result is unfavorable.
''')

# P11-H Cumulative Acceptance

**Status:** ACCEPTANCE CANDIDATE — authoritative only after Quality passes on this exact documentation tree  
**Date:** 2026-09-11  
**Phase:** P11-H — P11 Industrial HTTP Essentials cumulative close  
**Freeze:** `3dd785c82a42aefd385d2ce98ac0258f1a3427be`

## Decision scope

P11-H closes the cumulative acceptance sequence for the P11 Industrial HTTP Essentials capability family:

```text
cookies
CORS
request/body limits
secure headers
request ID
timeout / abort
```

This phase adds no new HTTP capability. It verifies that the accepted P11-C through P11-G production implementation remains correct, package-safe, type-scalable, zero-unused, and competitively viable when representative policies are enabled together.

The production runtime candidate measured throughout P11-H is unchanged:

```text
1dd5f94cf0e9ad884ca44e537ee287587cd8baab
```

The cumulative pre-capability control remains:

```text
0df4f1e20bef3e9fa7c9a554be022bc241536424
```

P11-H benchmark/documentation commits do not replace that runtime candidate.

---

## Acceptance summary

| Gate | Result | Primary evidence |
| --- | --- | --- |
| H1 architecture/type/performance freeze | PASS | `3dd785c82a42aefd385d2ce98ac0258f1a3427be` |
| H2 cumulative correctness + security | PASS | `bc09560b82d0c8ef872b27b46a6e9e564647376c` |
| H3 package + AOT/prebuilt + docs | PASS | `9789ff118ae011f3b203f0c2315bf8767d04ad13` |
| H4 cumulative TypeScript scaling | PASS | local authoritative run using harness `3765ef1df35ff0bd44b8792bd92309e4e0e1ec5b` |
| H5 cumulative zero-unused performance | PASS | local authoritative run using harness `fc05453a5910c567d024a6f17594e209f92136c2` |
| H6 representative enabled composition | PASS | local authoritative run using harness `11d441228a0c76cc5517fa3a03a72b0c87079d5a` |
| H7 full repository quality gate | PASS | Quality run `34570428131` on exact repository candidate `11d441228a0c76cc5517fa3a03a72b0c87079d5a` |
| H8 documentation Quality | PENDING ON THIS TREE | required before this document becomes authoritative |

No production source changed during P11-H. Therefore H4 through H7 all refer to the same accepted production runtime candidate.

---

# H2 — cumulative correctness and security composition

Accepted evidence tree:

```text
bc09560b82d0c8ef872b27b46a6e9e564647376c
```

Final Quality run:

```text
34564130639
```

The cumulative runtime suite passed with:

```text
794 pass
0 fail
2548 expect() calls
```

The targeted composition suite covered application CORS, secure headers, request ID, application timeout, preflight short-circuiting, synthetic protocol responses, timeout ownership, body-limit enforcement, cookie preservation/security, malformed CORS fail-closed behavior, incoming abort distinction, and finalization ordering.

No production source changed in H2.

---

# H3 — package, AOT/prebuilt, and documentation boundary

Accepted evidence tree:

```text
9789ff118ae011f3b203f0c2315bf8767d04ad13
```

Final Quality run:

```text
34564581612
```

H3 verified the portable subpaths:

```text
gelis/cookie
gelis/cors
gelis/body-limit
gelis/secure-headers
gelis/request-id
gelis/timeout
```

It also verified cumulative AOT/prebuilt composition, before/after hydration behavior, route topology identity, body-limit and timeout specialization, response-policy persistence, request-local runtime ownership, and absence of P11 runtime-policy leakage into public contract snapshots.

No production source changed in H3.

---

# H4 — cumulative TypeScript scaling acceptance

Authoritative local environment:

```text
OS:         Windows
CPU:        Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
Bun:        1.4.0
TypeScript: 7.0.2
Runs/case:  3
Sizes:      100 / 500 / 1000 / 5000 routes
```

Harness evidence tree:

```text
3765ef1df35ff0bd44b8792bd92309e4e0e1ec5b
```

Control and candidate:

```text
control:   0df4f1e20bef3e9fa7c9a554be022bc241536424
candidate: 1dd5f94cf0e9ad884ca44e537ee287587cd8baab
```

## Matrix A — plain cumulative no-regression

| Routes | Control inst. | Candidate inst. | Inst. ratio | Control memory | Candidate memory | Memory ratio | Control check | Candidate check | Check ratio | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 100 | 106,766 | 109,640 | 1.0269x | 88.6 MB | 89.8 MB | 1.0135x | 0.313 s | 0.267 s | 0.8530x | PASS |
| 500 | 167,450 | 170,821 | 1.0201x | 96.5 MB | 97.9 MB | 1.0145x | 0.328 s | 0.285 s | 0.8689x | PASS |
| 1,000 | 242,450 | 245,821 | 1.0139x | 106.4 MB | 107.5 MB | 1.0103x | 0.349 s | 0.317 s | 0.9083x | PASS |
| 5,000 | 842,450 | 845,821 | 1.0040x | 182.5 MB | 183.8 MB | 1.0071x | 0.563 s | 0.529 s | 0.9396x | PASS |

Candidate 1,000-to-5,000 growth:

```text
instantiation growth: 3.4408x <= 5.5x  PASS
check-time growth:    1.6688x <= 6.0x  PASS
```

## Matrix B — combined P11 route-policy scaling

The feature case used the same managed POST/schema/handler shape as baseline, with only route `bodyLimit` and `timeout` enabled.

| Routes | Inst. feature/baseline | Memory feature/baseline | Check feature/baseline | Result |
| ---: | ---: | ---: | ---: | --- |
| 100 | 1.0000x | 1.0024x | 1.0000x | PASS |
| 500 | 1.0000x | 1.0174x | 1.0728x | PASS |
| 1,000 | 1.0000x | 1.0382x | 1.0081x | PASS |
| 5,000 | 1.0000x | 1.0802x | 1.0885x | PASS |

Feature 1,000-to-5,000 growth:

```text
instantiation growth: 3.7394x <= 5.5x  PASS
check-time growth:    2.0777x <= 6.0x  PASS
```

The stable-root `Gelis` assertion also compiled.

The GitHub-hosted H4 benchmark run was retained as supplemental reproducibility evidence only. It is not the authoritative performance/type-scaling machine result; the local Windows/i5-10500H run above is authoritative.

---

# H5 — cumulative zero-unused performance acceptance

Authoritative local environment:

```text
CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
Bun: 1.4.0
```

Harness evidence tree:

```text
fc05453a5910c567d024a6f17594e209f92136c2
```

Control and candidate:

```text
control:   0df4f1e20bef3e9fa7c9a554be022bc241536424
candidate: 1dd5f94cf0e9ad884ca44e537ee287587cd8baab
```

Authoritative local result:

| Case | Candidate/control | Gate | Result |
| --- | ---: | ---: | --- |
| static raw | 0.9746x | <= 1.03x | PASS |
| dynamic raw | 0.9950x | <= 1.03x | PASS |
| static JSON | 0.9860x | <= 1.03x | PASS |
| dynamic JSON | 0.9888x | <= 1.03x | PASS |
| four-case geometric mean | 0.9861x | <= 1.015x | PASS |

Structural assertions also passed:

```text
no installed P11 capability -> no application HTTP plan
plain route -> existing RUNTIME_ROUTE_PLAIN fast path
no body limit -> existing managed body reader path
no request-ID/timeout -> no request-local P11 state
```

Ratios below `1.00x` are treated only as no-regression evidence for this workload and machine. They are not universal speedup claims.

Supplemental hosted evidence on the formatted H5 tree:

```text
Quality:                       34566677008  PASS
H5 supplemental benchmark:     34566677010  PASS
```

Hosted performance is supplemental only; the local result above is authoritative.

---

# H6 — representative enabled composition performance acceptance

Authoritative local environment:

```text
OS:   Windows
CPU:  Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
Bun:  1.4.0
Hono: 4.13.5
oha:  1.16.0
```

Harness evidence tree:

```text
11d441228a0c76cc5517fa3a03a72b0c87079d5a
```

Production candidate:

```text
1dd5f94cf0e9ad884ca44e537ee287587cd8baab
```

The common-equivalent application-boundary policy enabled:

```text
CORS fixed origin https://client.test
same effective Gelis default secure-header field set
deterministic fixed request ID generator
60,000 ms framework timeout
Origin: https://client.test
```

## Direct comparison

| Scenario | Gelis ns/op | Hono ns/op | Gelis/Hono | Hono-first | Gelis-first | Gate | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| actual-CORS static 204 | 5,352.9 | 9,196.3 | 0.5895x | 0.5737x | 0.6254x | <= 1.15x | PASS |
| actual-CORS static JSON | 5,835.8 | 10,963.1 | 0.5432x | 0.5434x | 0.5175x | <= 1.15x | PASS |

```text
2-case geomean: 0.5659x <= 1.10x  PASS
```

These ratios apply only to the frozen H6 workload and environment. They are not a universal framework ranking.

## HTTP comparison

Protocol:

```text
50 concurrent connections
7 alternating framework pairs
warmup before measurement
same enabled policy and Origin header
```

Authoritative local summary:

```text
Gelis median:        14,376 req/s
Hono median:         13,132 req/s
median throughput:   1.0947x
pairwise diagnostic: 1.1056x
Hono-first:          1.1136x
Gelis-first:         1.0839x
HTTP gate:           1.0947x >= 0.90x  PASS
```

Latency diagnostics:

| Framework | p50 | p95 | p99 |
| --- | ---: | ---: | ---: |
| Gelis | 3.265 ms | 5.421 ms | 7.764 ms |
| Hono | 3.615 ms | 5.946 ms | 8.389 ms |

## Combined route-policy scale

```text
1,000 routes median: 40,338.1 ns/op
5,000 routes median: 30,518.2 ns/op
5000/1000 median:    0.7464x
1000-first:          0.7574x
5000-first:          0.7437x
route-scale gate:    0.7464x <= 1.50x  PASS
```

The ratio below `1.00x` is interpreted only as absence of route-count degradation under this measured workload. It is not a claim that 5,000 routes are intrinsically faster than 1,000 routes.

Supplemental hosted evidence on the same formatted H6 tree:

```text
Quality:                   34569473618  PASS
H6 supplemental benchmark: 34569473567  PASS
```

Hosted H6 performance is supplemental only; the local Windows/i5-10500H result above is authoritative.

---

# H7 — full repository quality gate

Fresh branch:

```text
work/p11-h7-final-check
```

Exact repository candidate:

```text
11d441228a0c76cc5517fa3a03a72b0c87079d5a
```

Quality run:

```text
34570428131
```

Result:

```text
Format, typecheck, and tests: PASS
```

The branch pointed exactly at the final P11-H repository candidate and used the repository Quality workflow with Bun `1.4.0` and frozen dependency installation.

---

# Retained non-acceptance / corrected evidence

P11-H preserves evidence that was not eligible for final acceptance rather than silently replacing it.

## Formatting-only failures

H2 and H3 each had an initial Quality failure caused only by Prettier. Their unformatted commits were not promoted; acceptance used the later formatted evidence trees recorded above.

H6 initial Quality run:

```text
34569335734  FAIL
```

The failure was Prettier-only on the H6 `.mts` harness files. No performance gate or production behavior was changed. The formatted tree was then validated and used for both supplemental and local-authoritative H6 evidence.

## H4 hosted-run authority correction

An H4 benchmark was initially executed on GitHub Actions and passed its frozen numerical gates. That hosted result was later explicitly reclassified as non-authoritative for machine-sensitive acceptance because it was not the established local Windows/i5-10500H benchmark environment.

The frozen gates were not changed. H4 was rerun locally on the established machine and the local result recorded above became authoritative.

The same authority boundary was applied prospectively to H5 and H6: GitHub-hosted performance runs are retained as supplemental evidence only.

## H5 intermediate failed workflow runs

Intermediate H5 harness/workflow commits produced failed Quality/supplemental runs before the final formatted evidence tree. They remain retained in GitHub Actions history and are not acceptance evidence. The accepted H5 harness identity is only:

```text
fc05453a5910c567d024a6f17594e209f92136c2
```

No failed or invalid result caused a frozen H5/H6 performance gate to be relaxed.

---

# Final interpretation

The cumulative evidence supports all of the following for the exact P11 runtime candidate:

```text
correct cumulative HTTP semantics and security composition
portable package boundaries
AOT/prebuilt compatibility
stable root type and bounded TypeScript scaling
no material zero-unused runtime regression
representative enabled composition within frozen Hono comparison gates
bounded 1,000-to-5,000 route-policy request scaling
full repository Quality success
```

Performance ratios are workload-specific evidence. They do not establish universal Gelis superiority over Hono or any other framework.

## Conditional final decision

If the repository Quality workflow passes on the exact tree containing this document, the H8 condition is satisfied and the decision becomes:

```text
P11-H CUMULATIVE ACCEPTANCE: PASS
P11 INDUSTRIAL HTTP ESSENTIALS: ACCEPTED
```

No npm publish, Git tag, GitHub Release, or other public release action is authorized by this acceptance.

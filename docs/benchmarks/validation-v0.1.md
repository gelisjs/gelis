# Gelis Validation Performance v0.1

**Status:** Accepted  
**Reference runtime:** Bun 1.4.0  
**HTTP benchmark:** oha 1.16.0  
**Route count:** 5,000  
**Connections:** 50  
**Samples:** 7

## Scope

This document records the accepted Validation Optimization Rewind v0.1.

The rewind did not redesign the validation API.

Its purpose was to challenge the existing validation implementation, identify measurable request-path costs, test optimization hypotheses, and retain only changes that preserved:

- correctness;
- Standard Schema semantics;
- portability;
- zero-unused behavior;
- maintainable runtime structure;
- realistic HTTP performance.

The process followed:

```text
control
  ↓
component attribution
  ↓
paired experiments
  ↓
correctness verification
  ↓
zero-unused verification
  ↓
HTTP verification
  ↓
accept / reject
```

Microbenchmark improvements were not treated as sufficient evidence by themselves.

## Accepted production optimizations

### Fused query parser

The accepted query parser performs delimiter discovery and encoded-component detection in one scan.

It preserves:

```text
?a=b
?a=b&a=c
?q=hello+world
?q=x%2By
?token=a=b=c
```

semantics while avoiding additional scans for the common path.

Dedicated correctness verification covered:

```text
50,060 cases
50,060 pass
```

Paired runtime results included:

```text
basic query

current      252.04 ns
candidate    209.57 ns

delta        -44.08 ns
             -17.47%

wins         21 / 21
```

Encoded and repeated-query workloads also improved.

Representative paired results:

```text
encoded      approximately -4.96%
wins         20 / 21

duplicates   approximately -20.72%
wins         21 / 21
```

The production implementation was accepted because the improvement was reproducible across multiple query shapes and correctness remained intact.

### Canonical JSON Content-Type fast path

JSON body validation commonly receives:

```text
Content-Type: application/json
```

The accepted implementation recognizes this canonical value before entering the generic media-type normalization path.

Conceptually:

```text
content-type
     ↓
canonical application/json?
     ↓ yes
   accept

     ↓ no
generic media-type handling
```

The generic fallback remains responsible for cases such as:

```text
application/json; charset=utf-8
Application/Json
application/problem+json
application/vnd.api+json
```

Paired runtime results:

```text
exact application/json

current      83.32 ns
candidate    52.43 ns

delta        -30.30 ns
             -36.04%

wins         21 / 21
```

Mixed realistic workload:

```text
delta        -24.14 ns
             -23.44%

wins         21 / 21
```

Parameterized JSON remained approximately neutral:

```text
+1.12 ns
+0.79%
```

Structured JSON suffix handling remained healthy:

```text
-3.19 ns
-3.11%
```

Runtime regression tests explicitly cover:

```text
application/json; charset=utf-8
application/problem+json
```

## Zero-unused validation cost

Validation must remain route-local.

A dedicated paired benchmark compared:

```text
control
5000 plain routes

validation-heavy application
1 measured plain route
4999 validated routes
```

The measured plain route remained synchronous in both applications.

Results:

```text
plain-only          168.18 ns
validation-heavy    168.64 ns

paired delta        +0.16 ns
                    +0.09%

validation-heavy
faster samples      15 / 31
```

Order check:

```text
plain-first         +0.30%
mixed-first         -0.11%
```

The direction changes with benchmark order and the paired difference is effectively zero.

Accepted conclusion:

> Enabling validation on thousands of unrelated routes does not impose measurable validation overhead on the measured plain route in this benchmark.

This is evidence for the Gelis architectural requirement that unused capabilities remain outside unrelated execution plans.

## Rejected optimization hypotheses

The rewind intentionally retained negative results.

Rejected or superseded directions included:

```text
validator pre-capture
URLSearchParams query parsing
global query pre-scan
marker/cursor query parser variants
hybrid query parser variants
request.url caching
removing query try/catch
generic handler-invoker removal
helper inlining
removing PromiseLike detection
sync-validator specialization
native Promise-only fast paths
trusted schema Promise paths
async/await query continuation
Request.text() + JSON.parse()
async/await body continuation
```

Representative reasons included:

- no reproducible gain;
- improvement below useful noise level;
- benchmark artifact;
- regression on another workload;
- worse asynchronous performance;
- unnecessary semantic or maintenance cost;
- superseded by a simpler candidate.

In particular:

```text
Request.json()
vs
Request.text() + JSON.parse()
```

showed no useful improvement.

And:

```text
Promise .then()
vs
async/await
```

for the body path showed approximately:

```text
+84.24 ns
+6.16%

candidate wins 1 / 21
```

so the current continuation shape was retained.

## Final correctness gate

After accepted production changes and benchmark cleanup:

```text
90 pass
0 fail
182 expect() calls
```

The gate includes:

```text
main TypeScript typecheck
benchmark TypeScript typecheck
type tests
runtime-test typecheck
Bun-adapter typecheck
runtime tests
```

## Final HTTP validation matrix

Framework versions:

```text
Gelis       current validation-rewind branch
Hono        4.13.5
Hono std    0.4.0
Elysia      1.4.30
Bun         1.4.0
oha         1.16.0
```

Configuration:

```text
routes       5000
connections  50
samples      7
```

Median throughput:

| workload    |        Gelis |         Hono | Gelis vs Hono |
| ----------- | -----------: | -----------: | ------------: |
| query-sync  | 15,630 req/s | 14,168 req/s |       +10.32% |
| query-async | 15,334 req/s | 13,969 req/s |        +9.77% |
| body-sync   | 14,201 req/s | 13,363 req/s |        +6.27% |
| query-body  | 13,629 req/s | 12,808 req/s |        +6.41% |

All measured workloads completed with:

```text
100% success
```

Gelis also recorded lower p50, p95, and p99 latency than Hono in all four workloads in this run.

Some workloads showed moderate run variance, including approximately 4.5% CV for Gelis query-sync and query-body.

The HTTP table is therefore treated as workload-specific same-machine engineering evidence rather than a universal framework ranking.

## Interpretation

The HTTP differences above are:

```text
Gelis vs Hono
```

comparisons.

They are not:

```text
before vs after optimization
```

measurements.

The rewind therefore does not claim that the accepted optimizations increased complete HTTP throughput by 6-10%.

The defensible conclusions are:

1. fused query parsing materially reduces isolated Gelis query-parsing cost;
2. canonical `application/json` detection materially reduces isolated Content-Type detection cost;
3. accepted optimizations preserve validation correctness;
4. validation-heavy applications retain effectively zero measurable unused-validation cost on the tested plain route;
5. no HTTP regression was observed after integration;
6. Gelis remained ahead of Hono on all four final validation workloads on this machine and configuration.

## Permanent regression benchmarks

Accepted validation regression evidence is retained in:

```text
bench/runtime/validation-query-parser-correctness.mts
bench/runtime/validation-query-parser-paired.mts
bench/runtime/validation-content-type-paired.mts
bench/runtime/validation-zero-unused-paired.mts
bench/http/validation/run.mts
```

Exploratory diagnostics that established rejected hypotheses are not retained merely to preserve development history.

The permanent benchmark suite records accepted behavior and reproducible regression gates.

## Acceptance

Validation Optimization Rewind v0.1 is accepted.

Production winners:

```text
fused query parser
canonical application/json fast path
```

Core runtime behavior retained:

```text
Standard Schema integration
sync-schema detection
Promise-based async validation continuation
Request.json() body parsing
generic JSON media-type fallback
route-local validation plans
plain-route specialization
```

The validation implementation is frozen at this checkpoint until new profiling evidence, runtime changes, correctness requirements, or realistic workload measurements justify reopening it.

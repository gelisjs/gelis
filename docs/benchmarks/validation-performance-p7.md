# P7 Validation Performance Final Report

Status: **P7 COMPLETE / FROZEN**  
Runtime: **Bun 1.4.0**  
CPU: **Intel Core i5-10500H**  
Branch: `perf/architecture-v0.2`

## Scope

P7 optimizes the existing validation runtime without expanding the input system.

Current scope:

- Standard Schema V1
- query validation
- JSON body validation
- synchronous and asynchronous validators
- lifecycle/error compatibility
- zero-unused validation overhead

Out of scope for this phase:

- multipart/form-data
- application/x-www-form-urlencoded
- text/plain
- binary/raw bodies
- header/cookie validation
- separate params validation
- reopening the frozen P5 router unless a correctness bug is found

## Frozen interpretation rules

- Isolated stage timings are diagnostic and must not be arithmetically summed as exact request cost.
- Noise below `max(5 ns, 3%)` is not an optimization basis.
- CV <= 3%: strong.
- CV 3â€“5%: caution.
- CV > 5%: requires confirmation before making a decision.
- Valid request paths have priority over invalid/failure paths.
- A candidate cannot be accepted only because validated routes improve if plain routes regress materially.
- Plain-route material regression requires both `> 5 ns` and `> 3%`, with consistent direction.
- Acceptance gates must be frozen before seeing candidate results.

---

## P7-A â€” Validation Cost Decomposition

Status: **COMPLETE**

### Main decomposition result

| Stage                     | Median ns/op |     CV |
| ------------------------- | -----------: | -----: |
| input-plan-lookup         |         2.36 |  3.16% |
| query-parse               |       201.88 |  2.63% |
| query-schema-sync         |        27.29 |  2.41% |
| query-dispatch-sync       |        22.44 |  1.77% |
| query-schema-async        |       163.86 |  2.39% |
| query-dispatch-async      |       166.03 |  2.08% |
| value-propagation-replica |         0.94 |  2.82% |
| validation-error-response |       735.51 |  3.09% |
| plain-fetch               |       146.96 |  2.94% |
| query-sync-fetch          |       472.54 |  1.78% |
| query-invalid-fetch       |      1206.90 |  3.19% |
| query-async-fetch         |       707.38 |  1.62% |
| content-type              |        51.99 |  3.03% |
| body-request-json         |       442.05 |  6.24% |
| body-schema-sync          |        10.83 |  5.67% |
| body-sync-fetch           |       918.66 |  6.38% |
| query-body-fetch          |      1322.85 | 22.13% |
| query-lifecycle-fetch     |       503.54 |  5.11% |

### P7-A conclusions

- First confirmed bottleneck: **query parsing**.
- Query parsing was ~42.7% of the valid sync-query anchor in this diagnostic.
- Sync schema invocation was secondary.
- Async schema/dispatch overhead was material but is a separate path.
- Body parsing looked material, but body-stage CV was too high to confirm.
- Lifecycle result was too noisy to reopen lifecycle work.

### Zero-unused validation invariant

Control: 5000 plain routes.  
Candidate: 1 plain route + 4999 validated routes.  
Same plain target, paired same process, 31 samples.

Result:

- paired delta: **-3.73 ns**
- paired delta: **-2.19%**
- order halves: both negative
- no material plain-route regression detected

Decision: **PASS**

Official state:

> P7-A Validation Cost Decomposition COMPLETE  
> Zero-unused validation invariant PASS  
> Plain-route material overhead NOT DETECTED  
> First confirmed bottleneck QUERY PARSING

---

## P7-B â€” Query Parser Research

### B1 â€” Indexed delimiter search

Hypothesis: repeated native `String.indexOf()` delimiter searches may beat the current fused `charCodeAt()` scan.

Result:

| Scenario   | Current ns | Indexed ns | Delta ns | Delta % |
| ---------- | ---------: | ---------: | -------: | ------: |
| basic      |     211.13 |     256.13 |   +45.02 | +21.61% |
| encoded    |     537.52 |     571.37 |   +34.76 |  +6.62% |
| duplicates |     409.34 |     516.17 |  +105.86 | +26.08% |
| wide       |     392.55 |     586.77 |  +191.30 | +48.60% |

Decision: **REJECT**

Reason: primary basic workload regressed heavily and consistently.

---

### B2 â€” Query parser internal decomposition

Status: **DIAGNOSTIC COMPLETE**

| Stage                  | Median ns/op |    CV |
| ---------------------- | -----------: | ----: |
| object-allocation      |        15.87 | 8.01% |
| boundary-lookup        |        30.04 | 3.32% |
| scan-only-basic        |        75.76 | 6.62% |
| materialize-basic      |       217.25 | 1.57% |
| full-basic             |       227.66 | 4.30% |
| scan-only-encoded      |        96.25 | 3.37% |
| materialize-encoded    |       229.83 | 7.02% |
| full-encoded           |       572.42 | 2.59% |
| scan-only-duplicates   |       103.38 | 3.52% |
| materialize-duplicates |       429.78 | 2.42% |
| full-duplicates        |       448.12 | 3.23% |

Interpretation:

- Basic and duplicate workloads point toward materialization as an important area.
- Encoded query cost is strongly affected by decoding.
- Isolated stages are not additive.

---

### B3 â€” Null-prototype object literal

Candidate:

```ts
{
  __proto__: null;
}
```

instead of:

```ts
Object.create(null);
```

Primary basic result:

- current: 227.68 ns
- literal: 271.86 ns
- delta: **+44.61 ns / +19.48%**
- literal faster: 0/31
- both order halves positive

Decision: **REJECT**

`Object.create(null)` remains preferable on the tested Bun workload.

---

### B4 â€” Bit-flags parser state

Inspired by the Elysia query parser.

Primary basic result:

- current: 220.80 ns
- bitflags: 222.21 ns
- delta: **+0.60 ns / +0.27%**
- order halves mixed

Wide improved by `-8.41 ns / -3.62%`, but the primary basic gate failed.

Decision: **REJECT**

---

### B5 â€” Remove fragment search

Hypothesis: fragment handling may be unnecessary for runtime `Request.url`.

Bun 1.4.0 result:

```text
new Request("http://gelis.test/r/4999?page=42&q=gelis#fragment").url
```

preserved `#fragment`.

Decision: **REJECT BY CORRECTNESS INVARIANT**

No performance measurement was accepted.

---

### B6 â€” Materialization decomposition

| Stage            | Median ns/op |     CV |
| ---------------- | -----------: | -----: |
| full-basic       |       223.39 |  8.58% |
| slice-basic      |        66.68 |  9.72% |
| write-basic      |        24.91 |  2.21% |
| full-duplicates  |       458.11 |  1.80% |
| slice-duplicates |        94.65 |  3.78% |
| write-duplicates |        42.43 | 10.18% |
| full-wide        |       248.07 |  6.86% |
| slice-wide       |       120.59 |  4.57% |
| write-wide       |        51.01 |  2.37% |

Conclusion:

- Dynamic result-object writes are not the dominant isolated cost.
- Slicing is more material than property writes.
- Full parser cost appears to come from interactions among scanning, slicing, decoding, and duplicate handling rather than one simple primitive.

---

### B7 â€” Known query-start upper bound

Inspired by Elysia's composed path carrying a known query index.

The candidate was given `queryStart` for free outside the timed section.

| Scenario   | Current ns | Known-start ns | Delta ns | Delta % |
| ---------- | ---------: | -------------: | -------: | ------: |
| basic      |     252.99 |         215.41 |   -37.19 | -14.63% |
| encoded    |     587.19 |         562.68 |   -22.61 |  -3.74% |
| duplicates |     466.77 |         445.38 |   -25.38 |  -5.40% |
| wide       |     243.63 |         226.47 |   -16.65 |  -6.73% |

Basic:

- 31/31 candidate wins
- both CVs <= 3%
- both order halves ~-14.5%

Decision: **STRONG UPPER-BOUND SIGNAL**

This was not a production candidate because the query index was provided for free.

---

### B8 â€” `indexOf("?", 8)`

Inspired by Hono's query delimiter search starting after the URL scheme prefix.

Primary basic result:

- current: 225.80 ns
- offset-8: 229.98 ns
- delta: **+3.06 ns / +1.33%**
- offset-8 faster: 8/31
- both order halves positive

Decision: **REJECT**

Conclusion: the B7 win did not come merely from shortening the delimiter scan prefix.

---

### B9 â€” Shared query-start integration shape

Candidate shape:

```text
find queryStart once
â†’ reuse for pathname extraction
â†’ reuse for query parser
```

This measured integration cost instead of providing the query index for free.

| Scenario   | Current ns | Shared ns | Delta ns | Delta % |
| ---------- | ---------: | --------: | -------: | ------: |
| plain      |      57.08 |     57.86 |    +0.79 |  +1.42% |
| basic      |     310.29 |    306.28 |    -1.66 |  -0.54% |
| encoded    |     675.03 |    672.34 |    -8.57 |  -1.28% |
| duplicates |     560.54 |    547.06 |   -11.93 |  -2.14% |
| wide       |     322.57 |    314.10 |    -8.51 |  -2.69% |

Decision: **REJECT**

Reason:

- Plain zero-unused remained safe.
- Primary basic improvement was not material.
- The strong B7 upper-bound benefit disappeared after integration cost was included.
- P5 routing/pathname boundaries remain frozen.

### Query parser research conclusion

The existing parser remains the first confirmed validation bottleneck, but no tested replacement or integration strategy was simultaneously:

- correct,
- materially faster on the primary workload,
- and safe for the plain path.

Current production query parser remains unchanged.

---

## P7-C â€” Standard Schema Invocation Research

### C1 â€” Cache `schema["~standard"]`

Candidate:

```ts
const standard = schema["~standard"];
standard.validate(value);
```

instead of:

```ts
schema["~standard"].validate(value);
```

Initial 31-sample run showed a consistent sync signal but missed the absolute gate and had high CV.

Confirmation run:

- 61 samples
- 300 ms/side/sample

| Scenario    | Current ns | Cached ns | Delta ns | Delta % | Current CV | Cached CV |
| ----------- | ---------: | --------: | -------: | ------: | ---------: | --------: |
| query-sync  |      36.46 |     31.51 |    -4.94 | -13.56% |      5.77% |     6.93% |
| body-sync   |      16.73 |     14.24 |    -2.46 | -14.89% |      4.20% |     4.72% |
| query-async |     177.23 |    175.82 |    -1.71 |  -0.95% |      7.87% |     6.87% |

Decision: **REJECT FINAL**

Reason:

- primary absolute improvement remained below 5 ns;
- primary CV remained above 5%;
- no third confirmation run allowed.

---

### C2 â€” Registration-time bound validator

Candidate:

```ts
const standard = schema["~standard"];
const validate = standard.validate.bind(standard);
```

Binding was performed once outside the timed section to preserve receiver semantics.

| Scenario    | Current ns | Bound ns | Delta ns | Delta % | Current CV | Bound CV |
| ----------- | ---------: | -------: | -------: | ------: | ---------: | -------: |
| query-sync  |      39.51 |    36.00 |    -3.51 |  -8.87% |     13.29% |    4.92% |
| body-sync   |      22.60 |    20.56 |    -2.11 |  -9.15% |      6.74% |    4.90% |
| query-async |     116.55 |    99.22 |   -17.44 | -15.04% |      3.62% |    2.99% |

Decision: **REJECT FINAL**

Reason:

- primary query-sync improvement was below the 5 ns absolute gate;
- current-side primary CV was far above 5%;
- async improvement cannot override failure of the frozen primary gate.

Production Standard Schema invocation remains unchanged.

---

## P7-D â€” Body Path Research

Status: **COMPLETE**

P7-D was opened because the original P7-A body stages had CV above 5%, so body work first required a more stable benchmark methodology before any optimization candidate could be considered.

### D1 â€” Initial body stabilization baseline

Benchmark:

- 31 samples
- 16,384 fresh `Request` objects per sample
- request construction outside the timed section
- fresh process per stage
- small JSON payload and ~1 KiB JSON payload

Result:

| Stage               | Median ns/op | CV |
| ------------------- | -----------: | -: |
| request-json-small  |       337.26 | 28.49% |
| body-fetch-small    |      1131.04 | 10.15% |
| request-json-medium |       735.38 | 10.21% |
| body-fetch-medium   |      1699.95 | 12.20% |

Decision: **REJECT AS STABLE BASELINE**

Reason:

- every stage exceeded the 5% CV limit;
- the benchmark retained too many fresh `Request` objects per sample;
- heap/GC effects were too large to use these values for optimization decisions.

No production conclusion was taken from D1.

---

### D2 â€” GC-controlled body stabilization baseline

Methodology changes:

- 31 samples
- 8,192 fresh `Request` objects per round
- 16 rounds per sample
- 131,072 body consumptions per sample
- `Bun.nanoseconds()` timing
- `Bun.gc(true)` before every timed round
- request construction outside timed segments
- fresh process per stage

Result:

| Stage               | Median ns/op | CV |
| ------------------- | -----------: | -: |
| request-json-small  |       326.65 | 5.12% |
| body-fetch-small    |       892.36 | 3.92% |
| request-json-medium |       572.96 | 4.01% |
| body-fetch-medium   |      1147.87 | 4.72% |

Decision: **ACCEPT AS DIAGNOSTIC METHODOLOGY**

Interpretation:

- three of four stages reached the 3â€“5% caution band;
- `request-json-small` narrowly missed the 5% boundary at 5.12%;
- JSON body parsing is clearly sensitive to payload size on this local Bun workload;
- isolated `Request.json()` and full body-fetch values remain non-additive;
- forced GC means these absolute values are diagnostic, not production-throughput claims.

---

### D3 â€” `.then()` versus `async/await` body continuation

Candidate:

```text
current:
request.json().then(success, failure)

candidate:
try {
  body = await request.json()
} catch {
  ...
}
```

Paired benchmark:

- 41 samples
- 8,192 requests per round
- 8 rounds per side per sample
- alternating order
- forced GC outside timed sides

Result:

| Scenario        | `.then()` ns | `await` ns | Paired delta | Delta | Await faster |
| --------------- | -----------: | ---------: | -----------: | ----: | -----------: |
| valid-small     |       490.72 |     511.18 |    +25.12 ns | +5.14% | 9/41 |
| valid-medium    |       834.71 |     825.52 |     +6.68 ns | +0.82% | 17/41 |
| malformed-small |      1135.42 |    1542.62 |   +390.77 ns | +35.56% | 0/41 |

Order halves:

- valid-small: `+5.48% / +3.50%`
- valid-medium: `+0.35% / +0.91%`
- malformed-small: `+33.64% / +35.78%`

Decision: **REJECT**

Reason:

- the primary valid-small workload regressed by more than both frozen gates;
- both valid-small order halves were positive;
- malformed JSON regressed heavily and consistently.

Production `request.json().then(success, failure)` remains unchanged.

---

### D4 â€” Direct semantic control versus Gelis body route

Purpose: estimate the size of total framework work around an otherwise equivalent body validation path.

The direct control performed:

```text
content-type check
â†’ Request.json()
â†’ Standard Schema validation
â†’ response
```

The Gelis side performed the same semantics through `app.fetch()`.

Result:

| Scenario          | Control ns | Gelis ns | Paired delta | Delta | Control faster |
| ----------------- | ---------: | -------: | -----------: | ----: | -------------: |
| valid-small       |     603.80 |   865.13 |   +266.53 ns | +43.85% | 41/41 |
| valid-medium      |     911.29 |  1245.67 |   +339.83 ns | +38.07% | 41/41 |
| malformed-small   |    1822.08 |  2176.39 |   +340.00 ns | +18.62% | 41/41 |
| unsupported-media |     700.74 |   878.20 |   +181.13 ns | +25.90% | 41/41 |

Both order halves agreed in all scenarios.

Decision: **DIAGNOSTIC ONLY**

Interpretation:

- the gap is real at the full-framework boundary;
- the delta includes pathname extraction, routing, route/input dispatch, context creation, and handler invocation;
- the full delta must not be attributed specifically to validation or body parsing.

---

### D5 â€” Native Gelis validation versus manual validation inside a Gelis handler

Purpose: remove normal `app.fetch()` / routing costs from the comparison.

Both sides used Gelis routing and `app.fetch()`.

Manual side:

```text
plain Gelis route
â†’ handler
â†’ content-type
â†’ Request.json()
â†’ Standard Schema
â†’ response
```

Native side:

```text
Gelis validated route
â†’ native input pipeline
â†’ handler
â†’ response
```

Result:

| Scenario          | Manual ns | Native ns | Paired delta | Delta |
| ----------------- | --------: | --------: | -----------: | ----: |
| valid-small       |    934.30 |    888.01 |    -21.64 ns | -2.49% |
| valid-medium      |   1239.75 |   1191.74 |    -47.57 ns | -3.75% |
| malformed-small   |   2155.09 |   2133.44 |    -20.11 ns | -0.92% |
| unsupported-media |    908.95 |    897.16 |     -4.78 ns | -0.52% |

Primary valid-small order halves:

- manual-first: `-4.14%`
- native-first: `-1.83%`

Decision: **MATERIAL NATIVE-VALIDATION OVERHEAD NOT DETECTED**

Interpretation:

- native validation did not show a material penalty versus equivalent manual validation inside Gelis;
- the primary median delta was below the 3% noise threshold;
- CV was above 5% on the valid paths, so no claim that native validation is faster is allowed;
- D4's large direct-control gap should therefore not be interpreted as a validation-subsystem penalty.

Production changes from P7-D: **NONE**

---

## External HTTP Validation Gate

Status: **PASS**

Environment:

- Bun 1.4.0
- oha 1.16.0
- Intel Core i5-10500H
- 5,000 routes
- 50 connections
- 7 samples
- 2 s warmup
- 10 s measurement
- 100% success required
- rotating framework order

Framework matrix:

- Gelis
- Hono 4.13.5 + `@hono/standard-validator` 0.4.0
- Elysia 1.4.30
- Elysia 1.4.30 with `precompile: true`
- Elysia 2.0.0-beta.11
- Elysia 2.0.0-beta.11 build-time AOT

Interpretation gate frozen before the final run:

```text
success rate must be 100%

CV <= 5%
  usable

CV > 5%
  caution

|delta| < 5%
  parity-ish

|delta| >= 5%
  directional difference worth reporting
```

### Median throughput

| Case        | Gelis | Hono | Elysia 1 | Elysia 1 precompile | Elysia 2 | Elysia 2 AOT |
| ----------- | ----: | ---: | -------: | -------------------: | --------: | ------------: |
| query-sync  | 14,771 | 13,223 | 8,729 | 8,919 | 14,390 | 14,337 |
| query-async | 14,589 | 13,268 | 8,608 | 8,748 | 14,153 | 14,219 |
| body-sync   | 13,351 | 12,725 | 10,488 | 10,575 | 13,185 | 12,971 |
| query-body  | 13,118 | 11,912 | 9,862 | 10,014 | 12,775 | 12,795 |

All framework/case combinations returned **100% success**.

### Gelis relative throughput

| Case        | vs Hono | vs Elysia 1 | vs Elysia 1 precompile | vs Elysia 2 | vs Elysia 2 AOT |
| ----------- | ------: | ----------: | ----------------------: | -----------: | ---------------: |
| query-sync  | +11.71% | +69.22% | +65.61% | +2.65% | +3.03% |
| query-async | +9.96% | +69.48% | +66.77% | +3.08% | +2.60% |
| body-sync   | +4.92% | +27.30% | +26.25% | +1.26% | +2.93% |
| query-body  | +10.12% | +33.02% | +31.00% | +2.68% | +2.52% |

### CV notes

Gelis:

- query-sync: **0.64%**
- query-async: **6.08%**
- body-sync: **0.81%**
- query-body: **0.67%**

Therefore:

- `query-sync`: strong usable result;
- `body-sync`: strong usable result;
- `query-body`: strong usable result;
- `query-async`: **caution** because Gelis CV exceeded 5%.

### External-gate conclusions

Against Hono on this local workload:

- `query-sync`: Gelis showed a directional lead of ~11.7%;
- `body-sync`: ~4.9%, therefore **parity-ish** under the frozen 5% gate;
- `query-body`: Gelis showed a directional lead of ~10.1%;
- `query-async`: median favored Gelis by ~10%, but Gelis CV was 6.08%, so this remains **caution** rather than a strong claim.

Against Elysia 2 / Elysia 2 AOT:

- all primary synchronous validation deltas were within ~1â€“3%;
- therefore Gelis is **parity-ish** with Elysia 2 on the tested validation workloads;
- no claim that Gelis is materially faster than Elysia 2 is supported by this gate;
- Elysia 2 AOT did not show a material throughput advantage over direct Elysia 2 in these validation cases.

Against Elysia 1:

- Gelis was substantially ahead on this tested local workload;
- this is primarily historical context because Elysia 2 materially changed the competitive baseline.

Safe public wording:

> On a local Bun 1.4.0, 5,000-route Standard Schema validation workload, Gelis was ~11.7% ahead of Hono on synchronous query validation and ~10.1% ahead on combined query+body validation, while remaining within ~1â€“3% of Elysia 2 beta on the tested primary validation workloads.

Do not generalize these values beyond the tested local workload.

---

## Final P7 state

```text
P7 Validation Performance          COMPLETE / FROZEN

P7-A validation decomposition      COMPLETE
P7-A zero-unused invariant         PASS

P7-B query parser research         COMPLETE
B1 indexed search                  REJECT
B3 null-prototype literal          REJECT
B4 bit flags                       REJECT
B5 no-fragment assumption          REJECT â€” correctness
B7 known query-start               UPPER-BOUND SIGNAL ONLY
B8 offset-8 search                 REJECT
B9 shared query-start integration  REJECT

P7-C Standard Schema research      COMPLETE
C1 cached ~standard props          REJECT FINAL
C2 bound validate function         REJECT FINAL

P7-D body path research            COMPLETE
D1 initial body baseline           REJECT AS STABLE BASELINE
D2 GC-controlled baseline          ACCEPT DIAGNOSTIC
D3 async/await continuation        REJECT
D4 direct-control gap              DIAGNOSTIC ONLY
D5 native vs manual validation     NO MATERIAL OVERHEAD DETECTED

External HTTP validation gate      PASS

Production changes from P7-B/C/D   NONE

P5 routing                         FROZEN
P6 AOT                             FROZEN
P7 validation                      FROZEN
```

No further P7 micro-optimization is justified by the current evidence set.

A future input-system phase may expand parser kinds and support additional body media types, but that is explicitly outside P7.

---

## Repository preservation policy for P7

### Keep in the branch

Permanent/canonical diagnostics:

- `bench/runtime/validation-decomposition.mts`
- `bench/runtime/validation-zero-unused-paired.mts`
- `bench/runtime/validation-query-parser-correctness.mts`
- `bench/runtime/validation-query-parser-decomposition.mts`
- `bench/runtime/validation-query-materialization-decomposition.mts`
- `bench/runtime/validation-body-baseline-gc-controlled.mts`
- `bench/runtime/validation-body-native-vs-manual-paired.mts`

Rejected/decision evidence worth preserving on the research branch:

- `bench/runtime/validation-query-indexed-paired.mts`
- `bench/runtime/validation-query-null-proto-literal-paired.mts`
- `bench/runtime/validation-query-bitflags-paired.mts`
- `bench/runtime/validation-query-known-start-paired.mts`
- `bench/runtime/validation-query-offset8-paired.mts`
- `bench/runtime/validation-query-shared-start-paired.mts`
- `bench/runtime/validation-standard-props-cache-paired.mts`
- `bench/runtime/validation-standard-bound-validator-paired.mts`
- `bench/runtime/validation-body-baseline.mts`
- `bench/runtime/validation-body-continuation-paired.mts`
- `bench/runtime/validation-body-framework-overhead-paired.mts`

External comparison infrastructure to preserve:

- `bench/http/validation/run.mts`
- `bench/http/validation/servers/elysia-v2.ts`
- `bench/http/validation/servers/elysia-v2-aot.ts`
- `bench/http/elysia-v2-aot/build-validation.mts`
- `bench/http/elysia-v2-aot/validation-app.ts`
- `bench/http/elysia-v2-aot/validation-server.ts`
- `bench/http/elysia-v2-aot/package.json`
- root `package.json` benchmark scripts

### Do not keep as a normal runnable benchmark

- `bench/runtime/validation-query-no-fragment-paired.mts`

Reason: it intentionally fails under the tested Bun 1.4.0 invariant. Preserve its decision and observed behavior in this document instead.

### Do not commit raw/generated results

Keep raw results and generated AOT artifacts under ignored benchmark result/generated directories.

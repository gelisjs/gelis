# P7 Validation Performance Research Checkpoint

Status: **P7 in progress**  
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
- CV 3–5%: caution.
- CV > 5%: requires confirmation before making a decision.
- Valid request paths have priority over invalid/failure paths.
- A candidate cannot be accepted only because validated routes improve if plain routes regress materially.
- Plain-route material regression requires both `> 5 ns` and `> 3%`, with consistent direction.
- Acceptance gates must be frozen before seeing candidate results.

---

## P7-A — Validation Cost Decomposition

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

## P7-B — Query Parser Research

### B1 — Indexed delimiter search

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

### B2 — Query parser internal decomposition

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

### B3 — Null-prototype object literal

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

### B4 — Bit-flags parser state

Inspired by the Elysia query parser.

Primary basic result:

- current: 220.80 ns
- bitflags: 222.21 ns
- delta: **+0.60 ns / +0.27%**
- order halves mixed

Wide improved by `-8.41 ns / -3.62%`, but the primary basic gate failed.

Decision: **REJECT**

---

### B5 — Remove fragment search

Hypothesis: fragment handling may be unnecessary for runtime `Request.url`.

Bun 1.4.0 result:

```text
new Request("http://gelis.test/r/4999?page=42&q=gelis#fragment").url
```

preserved `#fragment`.

Decision: **REJECT BY CORRECTNESS INVARIANT**

No performance measurement was accepted.

---

### B6 — Materialization decomposition

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

### B7 — Known query-start upper bound

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

### B8 — `indexOf("?", 8)`

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

### B9 — Shared query-start integration shape

Candidate shape:

```text
find queryStart once
→ reuse for pathname extraction
→ reuse for query parser
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

## P7-C — Standard Schema Invocation Research

### C1 — Cache `schema["~standard"]`

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

### C2 — Registration-time bound validator

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

## Current P7 state

```text
P7-A validation decomposition       COMPLETE
P7-A zero-unused invariant          PASS

P7-B query parser research          COMPLETE FOR CURRENT CANDIDATE SET
B1 indexed search                   REJECT
B3 null-prototype literal           REJECT
B4 bit flags                        REJECT
B5 no-fragment assumption           REJECT — correctness
B7 known query-start                UPPER-BOUND SIGNAL ONLY
B8 offset-8 search                  REJECT
B9 shared query-start integration   REJECT

P7-C Standard Schema lookup         COMPLETE FOR CURRENT CANDIDATE SET
C1 cached ~standard props           REJECT FINAL
C2 bound validate function          REJECT FINAL

Production changes from B/C          NONE
P5 routing                          REMAINS FROZEN
P6 AOT                              REMAINS FROZEN
```

## Next research direction

The next material area should not be another query-parser micro-variation or Standard Schema property lookup.

The strongest remaining candidate from P7-A is **body parsing / body validation path**, but the original body measurements had CV >5%.

Before any body optimization is attempted:

1. establish a lower-noise paired body baseline;
2. keep `Request.json()` as the control;
3. do not replace it with `text() + JSON.parse()` without new evidence;
4. preserve current JSON content-type and malformed-body semantics;
5. keep zero-unused behavior unchanged.

Elysia and Hono both currently use request-level JSON parsing in their web-standard validation/body paths, so Gelis should not assume a manual text parse is faster without direct evidence.

---

## Repository preservation policy for P7

### Keep in the branch

Permanent/canonical diagnostics:

- `bench/runtime/validation-decomposition.mts`
- `bench/runtime/validation-zero-unused-paired.mts`
- `bench/runtime/validation-query-parser-correctness.mts`
- `bench/runtime/validation-query-parser-decomposition.mts`
- `bench/runtime/validation-query-materialization-decomposition.mts`

Rejected/decision evidence worth preserving on the research branch:

- `bench/runtime/validation-query-indexed-paired.mts`
- `bench/runtime/validation-query-null-proto-literal-paired.mts`
- `bench/runtime/validation-query-bitflags-paired.mts`
- `bench/runtime/validation-query-known-start-paired.mts`
- `bench/runtime/validation-query-offset8-paired.mts`
- `bench/runtime/validation-query-shared-start-paired.mts`
- `bench/runtime/validation-standard-props-cache-paired.mts`
- `bench/runtime/validation-standard-bound-validator-paired.mts`

### Do not keep as a normal runnable benchmark

- `bench/runtime/validation-query-no-fragment-paired.mts`

Reason: it intentionally fails under the tested Bun 1.4.0 invariant. Preserve its decision and observed behavior in this document instead.

### Do not commit raw results

Keep generated/raw result files under ignored benchmark result directories.

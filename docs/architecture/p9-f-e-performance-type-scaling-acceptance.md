# P9-F-E Performance + TypeScript Scalability Acceptance

Status: ACCEPTED / P9 COMPLETE  
Phase: P9-F-E  
Date: 2026-09-09  
Branch: `architecture/composition-v0.1`  
Measured candidate: `2ed2ef7765b806ca3e400df632fc114dd1f74858`  
P9 cumulative runtime control: `a9740f2de5e8216b96de2b112d1aa79ae4b50dfe`

## Purpose

This document freezes the final performance and TypeScript-scalability acceptance evidence for the P9 HTTP Surface Architecture.

All thresholds used here were frozen before measurement in:

```text
docs/architecture/p9-f-a-performance-type-scaling-freeze.md
```

No threshold was changed after observing results.

P9-F-D external Hono/Elysia comparison remains optional diagnostic work and was not required for P9 acceptance. No external-framework performance claim is made by this acceptance.

## Pre-measurement validation

The permanent benchmark harness typechecked successfully before measurement:

```text
bun run typecheck:bench
```

The P9-F TypeScript runner then generated and compiled all required `100 / 500 / 1000 / 5000` route cases without unexpected compiler errors.

## P9-F-C TypeScript scalability acceptance

Environment:

```text
Runtime:       Bun 1.4.0
CPU:           Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
Runs/case:     3
Sizes:         100, 500, 1000, 5000
Controls:      routes, rich-contract
P9 scenarios:  p9-method-mix, p9-rich
```

Frozen per-size gates:

```text
instantiations ratio <= 1.15x
memory ratio         <= 1.15x
check-time ratio     <= 1.25x

5000-route check-time ratio <= 1.20x
```

Observed relative results:

| scenario | control | routes | inst ratio | memory ratio | check ratio | verdict |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| p9-method-mix | routes | 100 | 1.0161x | 1.0039x | 0.9618x | PASS |
| p9-rich | rich-contract | 100 | 1.0128x | 1.0141x | 1.0030x | PASS |
| p9-method-mix | routes | 500 | 1.0219x | 1.0066x | 1.0130x | PASS |
| p9-rich | rich-contract | 500 | 1.0056x | 1.0246x | 1.0531x | PASS |
| p9-method-mix | routes | 1000 | 1.0190x | 1.0067x | 1.0285x | PASS |
| p9-rich | rich-contract | 1000 | 1.0031x | 1.0292x | 1.0520x | PASS |
| p9-method-mix | routes | 5000 | 1.0143x | 1.0054x | 1.0344x | PASS |
| p9-rich | rich-contract | 5000 | 1.0007x | 1.0405x | 0.9744x | PASS |

All per-size gates passed.

### 1000 -> 5000 growth

Frozen growth gates:

```text
instantiations growth <= 5.5x
check-time growth     <= 6.0x
```

Observed:

| scenario | instantiations growth | check-time growth | verdict |
| --- | ---: | ---: | --- |
| p9-method-mix | 3.4592x | 1.6677x | PASS |
| p9-rich | 4.6524x | 4.1829x | PASS |

Both growth gates passed.

### Structural hard gates

The generated scenarios compiled their root-type assertions successfully:

```text
typeof app === Gelis
```

Therefore the final P9 method/body-media surface did not introduce app-level registered-route generic accumulation in the measured scenarios.

The body parser/media declarations remained compatible with the frozen non-accumulating route architecture through 5,000 rich routes.

P9-F-C verdict:

```text
PASS
```

## P9-F-B cumulative runtime acceptance

Environment and protocol:

```text
Runtime:        Bun 1.4.0
CPU:            Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
Control SHA:    a9740f2de5e8216b96de2b112d1aa79ae4b50dfe
Candidate SHA:  2ed2ef7765b806ca3e400df632fc114dd1f74858
Candidate dirty:no
Routes:         5,000/workload
Samples:        41 mirrored samples/workload
Workers:        four persistent processes/workload
Orientations:   control/candidate + candidate/control
Pair shape:     semantic ABBA / BAAB
Warmup:         10,000 app.fetch calls/worker
Measurement:    20,000 app.fetch calls/measurement
GC:             Bun.gc(true) inside measured worker
Canonical:      geometric mean candidate/control ratio
Summary:        median mirrored delta
```

Frozen gate for every workload:

```text
mirrored median candidate/control delta <= +3.0%
```

Observed final summary:

| workload | mirrored delta | control-start diagnostic | candidate-start diagnostic | gate | verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| plain-static | +2.31% | +5.66% | -0.90% | <= +3.0% | PASS |
| plain-dynamic | +0.34% | +2.25% | -0.84% | <= +3.0% | PASS |
| query-json | +0.59% | +1.48% | -0.77% | <= +3.0% | PASS |
| rich-managed | +0.01% | -0.32% | +2.32% | <= +3.0% | PASS |

All cumulative runtime workloads passed.

`plain-static` was the closest result to the frozen limit at `+2.31%`, leaving `0.69` percentage points of margin. This is accepted because the canonical frozen metric is the mirrored median and its threshold was `+3.0%` before measurement.

Individual mirrored samples and the order-specific buckets contained larger positive and negative excursions. Those values are not substituted for the canonical metric: P9-F-A explicitly froze order buckets as diagnostic only and the median of mirrored canonical ratios as the acceptance statistic.

No negative delta is interpreted as a general speedup claim.

P9-F-B verdict:

```text
PASS
```

## Final P9-F verdict

All mandatory close-out gates passed:

```text
P9-F-B cumulative runtime              PASS
P9-F-C TypeScript scalability          PASS
P9-F-C structural root-type gates      PASS
P9-F-D external comparison             NOT REQUIRED / SKIPPED
```

Therefore:

```text
P9-F ACCEPTED
P9 HTTP SURFACE ARCHITECTURE COMPLETE
```

## Accepted final conclusions

The accumulated P9 HTTP surface did not exceed the frozen `+3%` cumulative request-path regression limit on any of the four pre-P9-equivalent workloads measured at 5,000 routes.

The final P9 method surface remained within the frozen TypeScript instantiation, memory, and check-time ratios through 5,000 routes.

The final P9 rich surface, including `POST / QUERY`, managed body parser/media declarations, query/body schemas, and explicit response contracts, also remained within the frozen TypeScript gates through 5,000 routes.

The root `Gelis` application type remained structurally stable in the generated P9 scenarios.

These results are local acceptance evidence for the stated Bun/CPU/compiler/workloads only. They are not generalized performance claims against other frameworks or hardware.

## Phase closure

The P9 roadmap is now closed:

```text
P9        HTTP Surface Architecture                         COMPLETE
├── P9-A  HTTP method audit                                 COMPLETE
├── P9-B  QUERY / RFC 10008                                 COMPLETE
├── P9-C  ALL + custom methods                              COMPLETE
├── P9-D  method semantics / HEAD / OPTIONS / Allow         COMPLETE
├── P9-E  content-type architecture                         COMPLETE
└── P9-F  performance + TypeScript scalability              COMPLETE
```

Future work must treat the accepted P9 semantics and performance/type evidence as frozen architecture unless a later explicitly scoped phase reopens them with new predeclared correctness and performance gates.

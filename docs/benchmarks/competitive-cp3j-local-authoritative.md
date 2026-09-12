# CP3-J Request URL Fast Path — Local Authoritative Result

Status: **VALID / AUTHORITATIVE / ACCEPTED**

## Frozen identity

- Candidate source: `2a10e42308631fe53faba9a789b227d0a1cb241c`
- Acceptance harness: `3580ff9b788048afe12cdc8e748da74072c2de3d`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Routes: 5,000
- Samples: 11 fresh worker processes per cell

The candidate keeps the generic `pathnameFromUrl()` behavior and adds a request-specific fast path for normalized HTTP/HTTPS `Request.url` values. The production call sites are routing in `src/app.ts` and HTTP-policy method resolution in `src/runtime/application-http.ts`. Non-HTTP/generic inputs fall back to the existing helper.

## Correctness and pre-timing history

The first CP3-J probe harness at `f94d66d12825bf5dbc109af0f52bf513b6721cd2` had a harness-only argument parsing error: the parser stored the literal key `probe-only` but the worker read `args.probeOnly`. That probe attempt is **INVALID pre-timing** and contains no candidate performance evidence.

The harness-only fix changed the read to `args["probe-only"]`, producing acceptance harness `3580ff9b788048afe12cdc8e748da74072c2de3d`. Candidate `src/**` did not change.

On the final harness:

- local full quality gate: PASS
- correctness probe: **12/12 PASS**
- remote Quality CI on the exact harness SHA: SUCCESS
- authoritative timed run: executed exactly once

## Authoritative timing

| cell                            | median ns/op |   p25 |   p75 |   min |   max |
| ------------------------------- | -----------: | ----: | ----: | ----: | ----: |
| pathname-baseline-static        |         70.3 |  65.6 |  70.6 |  64.5 |  79.2 |
| pathname-candidate-static       |         29.4 |  29.2 |  29.5 |  28.7 |  29.9 |
| pathname-baseline-dynamic       |         70.7 |  69.4 |  73.8 |  68.1 | 104.7 |
| pathname-candidate-dynamic      |         32.5 |  32.1 |  32.7 |  31.8 |  33.9 |
| dispatch-baseline-static        |        156.3 | 155.0 | 158.6 | 151.1 | 162.1 |
| dispatch-candidate-static       |        110.2 | 109.6 | 112.4 | 107.9 | 115.8 |
| dispatch-baseline-dynamic       |        285.2 | 279.0 | 308.7 | 267.6 | 338.6 |
| dispatch-candidate-dynamic      |        228.2 | 225.9 | 231.5 | 222.4 | 244.3 |
| pipeline-baseline-static-json   |        568.3 | 562.6 | 591.6 | 555.6 | 688.4 |
| pipeline-candidate-static-json  |        527.2 | 521.1 | 563.9 | 509.3 | 797.3 |
| pipeline-baseline-dynamic-json  |        760.1 | 746.9 | 790.0 | 741.0 | 833.9 |
| pipeline-candidate-dynamic-json |        694.9 | 688.8 | 705.2 | 681.3 | 725.0 |

## Frozen acceptance gates

The following gates were frozen before authoritative timing.

| diagnostic                                 |  result |      gate | status |
| ------------------------------------------ | ------: | --------: | ------ |
| pathname candidate / baseline static       | 0.4180x | <=0.9000x | PASS   |
| pathname candidate / baseline dynamic      | 0.4599x | <=0.9000x | PASS   |
| dispatch candidate / baseline static       | 0.7049x | <=1.0100x | PASS   |
| dispatch candidate / baseline dynamic      | 0.8002x | <=1.0100x | PASS   |
| dispatch candidate / baseline geomean      | 0.7511x | <=0.9700x | PASS   |
| pipeline candidate / baseline static JSON  | 0.9277x | <=1.0100x | PASS   |
| pipeline candidate / baseline dynamic JSON | 0.9142x | <=1.0100x | PASS   |
| pipeline candidate / baseline geomean      | 0.9209x | <=0.9900x | PASS   |

## Engineering conclusion

CP3-J removes a material part of the fresh-path boundary cost identified by CP3-H and CP3-I without replacing the router or weakening URL semantics.

Median improvements in the frozen local protocol were approximately:

- pathname extraction: 58.2% static and 54.0% dynamic
- route/handler dispatch: 29.5% static and 20.0% dynamic
- JSON pipeline: 7.2% static and 8.6% dynamic

This result is sufficient to advance the candidate to HTTP revalidation. It is not, by itself, evidence for a universal framework-performance crown. Real HTTP must be revalidated under the exact CP3-D competitor protocol before promotion.

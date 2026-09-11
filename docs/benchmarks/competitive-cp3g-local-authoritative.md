# Competitive Performance v0.1 — CP3-G Local Authoritative Result

Date: 2026-09-11

## Classification

**CP3-G LOCAL DYNAMIC RESIDUAL RUN: VALID / ACCEPTED AS DECOMPOSITION EVIDENCE**

This run is decomposition evidence used to choose the next optimization target. It is not itself a production-code acceptance gate.

## Frozen identity

- Harness SHA: `c0d0c4893c005fe5962a436d3dfedd0946f30b87`
- Frozen Gelis production source: `98d8c00bfda8913a951bdf8780e136672646a90c`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Routes: 5,000
- Samples: 11 fresh worker processes per cell
- Correctness probe before timing: 18/18 PASS
- GitHub Quality on harness SHA: SUCCESS

## Authoritative medians

- `pathname-dynamic`: 7.9 ns/op
- `last-index`: 2.5 ns/op
- `prefix-slice`: 2.4 ns/op
- `value-slice`: 2.5 ns/op
- `percent-scan`: 1.6 ns/op
- `params-computed-consume`: 2.5 ns/op
- `params-literal-consume`: 2.5 ns/op
- `params-factory-consume`: 2.5 ns/op
- `params-computed-escape`: 8.7 ns/op
- `handler-prebuilt-params`: 6.2 ns/op
- `handler-computed-params`: 6.9 ns/op
- `handler-literal-params`: 6.6 ns/op
- `router-static-consume`: 2.8 ns/op
- `router-dynamic-consume`: 26.4 ns/op
- `route-handler-static`: 159.0 ns/op
- `route-handler-dynamic`: 275.1 ns/op
- `pipeline-static-json`: 551.4 ns/op
- `pipeline-dynamic-json`: 709.5 ns/op

## Derived diagnostics

- Computed params / literal params: 1.0068x.
- Factory params / literal params: 1.0161x.
- Computed params escape / consume: 3.4941x.
- Handler computed minus prebuilt: 0.7 ns.
- Handler literal minus prebuilt: 0.4 ns.
- Router dynamic/static: 9.4496x.
- Route-handler dynamic minus static: 116.0 ns.
- Pipeline dynamic minus static: 158.1 ns.
- Normalization delta static: 392.4 ns.
- Normalization delta dynamic: 434.4 ns.

## Interpretation

1. Computed-key parameter materialization is not the dominant residual cost in the consumed-result case. Computed, literal, and closure-factory parameter cells are effectively equivalent at about 2.5 ns/op.
2. Passing freshly materialized params through context into the handler adds less than 1 ns relative to prebuilt params in this harness. Handler/context handoff is therefore not the source of the roughly 116 ns route-handler dynamic penalty.
3. Isolated dynamic router lookup is 26.4 ns/op versus 2.8 ns/op static, a difference of about 23.6 ns. This explains only a minority of the 116 ns route-handler dynamic/static gap.
4. The large gap appears only after pathname extraction, router matching, and handler dispatch are integrated. This is consistent with earlier CP3-A evidence in which the integrated URL-plus-router stage showed a similarly large static/dynamic difference.
5. A likely remaining source is interaction between freshly extracted pathname strings and route lookup, including substring materialization and string hashing. Constant-string primitive cells are insufficient to measure that cost.

## Next direction

Freeze CP3-H as a focused **fresh-path and URL-to-router boundary decomposition**. It must compare at least:

- `Request.url` access for static and dynamic URLs;
- pathname extraction from constant URL strings versus `request.url`;
- route lookup using stable pathname strings versus freshly sliced pathname strings;
- plain `Map.get` with stable keys versus newly materialized equivalent strings;
- static and trailing-param router lookup with freshly extracted pathname strings;
- an experimental direct path-hash scan that does not materialize pathname substrings, used only as a lower-bound architectural probe.

The goal is to determine whether the next production candidate should specialize the URL-to-router boundary. No production optimization should be implemented until this cost is isolated.
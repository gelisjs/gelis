# Competitive Performance v0.1 — CP3-W local authoritative HTTP revalidation

## Classification

**VALID / AUTHORITATIVE / ACCEPTED AS HTTP REVALIDATION**

The local run completed under the frozen CP3-W protocol and ended with `CP3-W LOCAL HTTP REVALIDATION RUN: COMPLETE`. The environment and source identities matched the freeze:

- Bun `1.4.2`
- CPU `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- harness `1cd919f536288a31f866fe0b893d72b90a557272`
- Gelis candidate `979821c709e809e29018791ce0fe212cded04162`
- previous Gelis production baseline `8e43aad09759d60378b3fc174292850057ccfba3`
- Hono `4.13.7`
- Elysia stable `1.4.30`
- Elysia next `2.0.0-beta.14`
- `5,000` routes
- oha `1.16.0`
- `7` mirrored fresh-server pairs per comparator/scenario cell
- warmup `1s / 10 connections`
- measurement `5s / 50 connections`

## Median throughput ratios

Ratio is Gelis req/s divided by comparator req/s.

| Comparator               | static-raw | dynamic-raw | static-json | dynamic-json |
| ------------------------ | ---------: | ----------: | ----------: | -----------: |
| Hono                     |    0.9925x |     1.5693x |     1.0448x |      1.5694x |
| Elysia stable            |    1.7731x |     1.8737x |     1.7499x |      1.8382x |
| Elysia stable precompile |    1.7824x |     1.8815x |     1.7665x |      1.8590x |
| Elysia next              |    1.0153x |     1.0108x |     0.9803x |      1.0061x |
| Elysia next AOT          |    1.0129x |     1.0129x |     0.9985x |      0.9976x |
| raw Bun benchmark server |    1.6669x |     1.6860x |     1.6311x |      1.6522x |

Four-scenario geometric means:

| Comparator               | Geomean ratio |
| ------------------------ | ------------: |
| Hono                     |       1.2642x |
| Elysia stable            |       1.8080x |
| Elysia stable precompile |       1.8217x |
| Elysia next              |       1.0030x |
| Elysia next AOT          |       1.0054x |
| raw Bun benchmark server |       1.6589x |

## Interpretation

The candidate preserves the previously established real-HTTP profile while carrying the CP3-V production-shape gains into the full server path.

- Dynamic routing remains a material Gelis advantage over Hono: `1.5693x` on dynamic raw and `1.5694x` on dynamic JSON.
- Gelis remains far ahead of Elysia stable and stable precompile on this workload.
- Elysia next and Elysia next AOT remain parity-class competitors. The four-scenario geomeans are `1.0030x` and `1.0054x` respectively.
- This is not evidence for a universal fastest-framework claim. Hono is slightly ahead on static raw (`0.9925x`), Elysia next is ahead on static JSON (`0.9803x`), and Elysia next AOT is effectively tied on JSON (`0.9985x` / `0.9976x`).
- The run contains no evidence of a material HTTP regression that would block promotion of the CP3-V candidate.

## Decision

CP3-W is accepted as the real-HTTP revalidation for candidate `979821c709e809e29018791ce0fe212cded04162`.

The candidate may proceed to production promotion, provided the promotion branch contains only the accepted production source/test changes relative to baseline `8e43aad09759d60378b3fc174292850057ccfba3` and passes the repository Quality gate.

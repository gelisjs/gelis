# Competitive Performance v0.1 — CP2 Acceptance

**Status:** ACCEPTED — LOCAL AUTHORITATIVE EVIDENCE  
**Date:** 2026-09-11  
**Frozen Gelis production source:** `1dd5f94cf0e9ad884ca44e537ee287587cd8baab`  
**Bun:** `1.4.2`  
**CPU:** `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`  
**Hono:** `4.13.7`  
**Elysia stable:** `1.4.30`  
**Elysia next:** `2.0.0-beta.14`

This document records the accepted outcome of the frozen CP2 core-performance phase. CP2-D direct dispatch and CP2-H real HTTP are separate measurement domains and are intentionally not combined into one performance aggregate.

No production source changed during CP2.

## Evidence identities

### CP2-D direct dispatch

- authoritative local harness SHA: `da867943bc1f3ad44876ae1673a86b1b9c1969f8`;
- result document: `docs/benchmarks/competitive-cp2d-local-authoritative.md`;
- first valid local timing run accepted without rerun.

### CP2-H real HTTP

- authoritative local harness SHA: `ac4ea2f693cd26b9505552c92d814d328b0430b7`;
- harness tree: `c2db72f4294f6819958fd948578bc229be855c1b`;
- `oha`: `1.16.0`;
- routes: `5,000`;
- sampling: `7` mirrored fresh-server pairs per cell;
- untimed warmup: `1s / 10 connections`;
- measured interval: `5s / 50 connections`;
- primary ratio: `Gelis req/s / comparator req/s`.

Exact-tree validation before the authoritative local timing run:

- repository Quality run `34581935920`: **SUCCESS**;
- CP2-H correctness/build/typecheck run `34581935963`: **SUCCESS**.

The first valid local CP2-H timing run completed all framework/workload cells and ended with `CP2-H LOCAL HTTP CROWN RUN: COMPLETE`. It is accepted as authoritative and must not be rerun merely because any cell is unfavorable or noisy.

## Invalid CP2-H evidence retained

An earlier CP2-H correctness execution, run `34581098748`, is **harness-invalid** and is not performance evidence.

Cause: the first AOT launcher explicitly removed `ROUTES`, `ROUTE_KIND`, and `BODY_KIND` from the runtime environment after building the Elysia 2 AOT artifact. The generated artifact therefore fell back to its default runtime configuration and exposed only the default small route set rather than the frozen `5,000`-route workload.

A separate diagnostic proved that launching the exact same artifact with build/runtime environment parity served `/r/0`, `/r/2`, `/r/3`, `/r/999`, and `/r/4999` successfully. The harness was then fixed to preserve those environment values. No comparator implementation, workload, sampling rule, or Gelis production source changed.

## CP2-D outcome

Direct-dispatch evidence remains exactly as recorded in `competitive-cp2d-local-authoritative.md`:

- Hono: Gelis faster in **16/16** measured cells;
- Elysia stable default: Gelis faster in **4/16** measured cells;
- Elysia stable `precompile: true`: Gelis faster in **4/16** measured cells;
- Elysia 2 beta.14 source runtime: Gelis faster in **5/16** measured cells;
- at `5,000` Hono dynamic routes, Gelis measured `41.2294x` faster for raw direct dispatch and `27.4950x` faster for JSON direct dispatch.

CP2-D therefore does **not** establish a universal Gelis direct-dispatch crown. Elysia remains the stronger direct-dispatch target overall, especially JSON paths.

## CP2-H authoritative summary

| comparator               | scenario     | Gelis req/s | comparator req/s | Gelis/comparator | Gelis-first | comparator-first | Gelis p50/p95/p99 ms | comparator p50/p95/p99 ms |
| ------------------------ | ------------ | ----------: | ---------------: | ---------------: | ----------: | ---------------: | -------------------- | ------------------------- |
| Hono                     | static raw   |      17,338 |           17,168 |          1.0252x |     0.9946x |          1.0419x | 2.707/4.108/6.472    | 2.759/4.284/6.566         |
| Elysia stable            | static raw   |      17,391 |            9,526 |          1.8260x |     1.8648x |          1.8090x | 2.720/4.116/6.345    | 5.023/8.168/9.935         |
| Elysia stable precompile | static raw   |      17,456 |            9,905 |          1.7664x |     1.7779x |          1.7664x | 2.700/4.217/6.563    | 4.834/7.652/9.391         |
| Elysia next              | static raw   |      17,705 |           17,339 |          1.0073x |     1.0154x |          1.0073x | 2.682/3.885/6.361    | 2.727/4.151/6.473         |
| Elysia next AOT          | static raw   |      17,544 |           17,399 |          0.9933x |     1.0204x |          0.9759x | 2.704/4.053/6.395    | 2.713/4.120/6.468         |
| raw Bun native routes    | static raw   |      17,153 |           10,517 |          1.6560x |     1.6368x |          1.6891x | 2.741/4.180/6.506    | 4.558/7.272/9.234         |
| Hono                     | dynamic raw  |      17,338 |           11,415 |          1.5303x |     1.5194x |          1.5497x | 2.739/4.138/6.560    | 4.206/6.760/8.657         |
| Elysia stable            | dynamic raw  |      17,510 |            9,270 |          1.8723x |     1.8836x |          1.8570x | 2.707/4.094/6.489    | 5.175/8.209/9.814         |
| Elysia stable precompile | dynamic raw  |      17,247 |            9,200 |          1.8791x |     1.8739x |          1.8874x | 2.720/4.231/6.571    | 5.212/8.012/9.642         |
| Elysia next              | dynamic raw  |      17,092 |           16,858 |          1.0018x |     0.9958x |          1.0372x | 2.751/4.287/6.695    | 2.800/4.483/6.759         |
| Elysia next AOT          | dynamic raw  |      17,366 |           16,992 |          1.0126x |     1.0228x |          1.0118x | 2.730/4.104/6.525    | 2.781/4.224/6.668         |
| raw Bun native routes    | dynamic raw  |      17,473 |           10,249 |          1.7100x |     1.7107x |          1.6949x | 2.716/4.027/6.557    | 4.708/7.297/9.208         |
| Hono                     | static JSON  |      17,082 |           16,422 |          1.0310x |     1.0281x |          1.0382x | 2.786/4.112/6.656    | 2.882/4.352/6.868         |
| Elysia stable            | static JSON  |      17,008 |            9,681 |          1.7648x |     1.7779x |          1.7211x | 2.791/4.150/6.715    | 4.946/7.877/9.531         |
| Elysia stable precompile | static JSON  |      17,135 |            9,779 |          1.7516x |     1.7321x |          1.7596x | 2.784/4.157/6.660    | 4.915/7.653/9.453         |
| Elysia next              | static JSON  |      17,185 |           17,435 |          0.9811x |     0.9812x |          0.9811x | 2.778/4.012/6.575    | 2.728/3.943/6.477         |
| Elysia next AOT          | static JSON  |      17,091 |           17,399 |          0.9753x |     0.9744x |          0.9766x | 2.787/4.187/6.618    | 2.734/4.000/6.565         |
| raw Bun native routes    | static JSON  |      17,027 |           10,447 |          1.6320x |     1.6367x |          1.6238x | 2.790/4.107/6.681    | 4.598/7.225/9.124         |
| Hono                     | dynamic JSON |      16,814 |           10,919 |          1.5372x |     1.5338x |          1.5372x | 2.830/4.302/6.650    | 4.403/7.168/8.927         |
| Elysia stable            | dynamic JSON |      16,641 |            9,087 |          1.8319x |     1.8084x |          1.8565x | 2.827/4.478/6.708    | 5.259/8.250/9.830         |
| Elysia stable precompile | dynamic JSON |      15,654 |            8,693 |          1.8068x |     1.7932x |          1.8930x | 2.943/4.911/6.983    | 5.499/8.744/10.407        |
| Elysia next              | dynamic JSON |      15,715 |           15,946 |          0.9843x |     0.9801x |          0.9940x | 2.959/4.914/7.107    | 2.919/4.811/7.021         |
| Elysia next AOT          | dynamic JSON |      15,476 |           15,859 |          0.9846x |     0.9772x |          0.9846x | 2.959/5.015/7.034    | 2.931/4.956/7.041         |
| raw Bun native routes    | dynamic JSON |      16,385 |            9,950 |          1.6334x |     1.6284x |          1.6780x | 2.859/4.551/6.924    | 4.854/7.525/9.522         |

## Descriptive HTTP aggregates

These geometric means are descriptive summaries of the four CP2-H workload ratios only. They are not separate acceptance gates and must not be combined with CP2-D.

| comparator                      | Gelis wins | 4-case geometric mean of Gelis/comparator |
| ------------------------------- | ---------: | ----------------------------------------: |
| Hono 4.13.7                     |        4/4 |                                   1.2557x |
| Elysia 1.4.30                   |        4/4 |                                   1.8233x |
| Elysia 1.4.30 precompile        |        4/4 |                                   1.8003x |
| Elysia 2 beta.14 source         |        2/4 |                                   0.9936x |
| Elysia 2 beta.14 AOT            |        1/4 |                                   0.9914x |
| raw Bun native routes reference |        4/4 |                                   1.6576x |

The Elysia 2 result is effectively a near-parity HTTP contest on this machine and protocol. Gelis is slightly ahead on the two raw workloads, while Elysia 2 is slightly ahead on the two JSON workloads. Elysia 2 AOT is also within a few percent of Gelis in every measured cell.

## Raw Bun reference interpretation

The frozen protocol called `Bun.serve({ routes })` a raw Bun `reference/ceiling`. The measured evidence falsifies the word **ceiling** for this workload: Gelis's `Bun.serve({ fetch: app.fetch.bind(app) })` path measured materially higher throughput than the native `routes` table in all four `5,000`-route cells.

This does **not** mean Gelis is faster than the Bun runtime itself. The two lanes exercise different dispatch architectures:

- the Bun reference uses `Bun.serve({ routes, fetch })` and lets Bun's native server route table select among `5,000` routes;
- Gelis uses `Bun.serve({ fetch: app.fetch.bind(app) })` and performs routing inside Gelis's fetch path.

Therefore the accepted interpretation is **raw Bun native-routes reference**, not an empirical upper bound and not a framework competitor. The original frozen protocol text remains unchanged as historical pre-result evidence; this acceptance document records the evidence-driven interpretation correction without rerunning CP2-H.

## Direct versus HTTP interpretation

CP2-D and CP2-H intentionally answer different questions, and their divergence is now useful evidence:

- Elysia stable often beats Gelis in direct dispatch, yet its measured real-HTTP path is substantially slower under this Windows/Bun/5,000-route protocol;
- Elysia 2 closes that end-to-end gap and reaches near parity with Gelis despite remaining materially faster than Gelis in several direct JSON cells;
- Hono's large-route dynamic-routing cost is visible in both domains, although the real-HTTP advantage is far smaller than the direct-dispatch ratio because socket/server costs dominate more of the total request path.

Direct dispatch must therefore not be used as a proxy for production HTTP throughput.

## Accepted claims boundary

CP2 supports workload-scoped statements only. Examples that are supported by this evidence include:

- on this local Windows/i5-10500H/Bun 1.4.2 setup at `5,000` routes, Gelis measured higher HTTP throughput than Hono 4.13.7 in all four frozen core workloads;
- under the same protocol, Gelis and Elysia 2 beta.14 measured within a few percent of each other over real HTTP, with Gelis ahead on raw responses and Elysia 2 ahead on JSON responses;
- Gelis measured substantially lower direct-dispatch cost than Hono for large dynamic route tables;
- Gelis did not win the overall direct-dispatch matrix against Elysia.

CP2 does **not** support "Gelis is universally the fastest framework" or "Gelis is faster than Bun".

## CP2 decision

**CP2 ACCEPTED.**

The phase established a credible performance baseline without changing production source, preserved unfavorable evidence, and identified the next optimization target clearly: improve Gelis's JSON/direct-response hot path and seek a real-HTTP lead over Elysia 2 without regressing raw-response throughput, dynamic-route scaling, zero-unused cost, correctness, portability, or type scalability.

# Competitive Performance v0.1 — CP3-D Local Authoritative HTTP Revalidation

**Status:** ACCEPTED — LOCAL AUTHORITATIVE EVIDENCE  
**Date:** 2026-09-11  
**Harness SHA:** `a2352eb758d8ed6790ba3cfa1eb5c366013b9755`  
**Accepted Gelis source:** `9af3f056c004151473ef6ad5535600ba47f39e0a`  
**Previous Gelis source:** `1dd5f94cf0e9ad884ca44e537ee287587cd8baab`  
**Bun:** `1.4.2` / `1.4.2+744846f84`  
**CPU:** `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`  
**oha:** `1.16.0`  
**Hono:** `4.13.7`  
**Elysia stable:** `1.4.30`  
**Elysia next:** `2.0.0-beta.14`

CP3-D revalidated the already-accepted CP3-C ordinary-success JSON normalization fast path over real HTTP. It intentionally reused the frozen CP2-H protocol and comparator stack without changing route count, concurrency, warmup, measured duration, sample count, response semantics, or pair ordering after seeing CP3-C results.

## Validity

The first valid local timing run was accepted without rerun.

Preflight and run identity matched the freeze:

- clean detached worktree at `a2352eb758d8ed6790ba3cfa1eb5c366013b9755`;
- `src/**` identical to accepted CP3-C source `9af3f056c004151473ef6ad5535600ba47f39e0a`;
- Bun `1.4.2`, revision `1.4.2+744846f84`;
- oha `1.16.0`;
- `5,000` routes;
- `7` mirrored fresh-server pairs per comparator/workload cell;
- untimed warmup `1s / 10 connections`;
- measured interval `5s / 50 connections`;
- all four workloads and all six comparator/reference lanes completed;
- run ended with `CP3-D LOCAL HTTP REVALIDATION RUN: COMPLETE`.

The earlier CP3-D CI formatting/setup failures occurred before timing and remain **INVALID setup evidence**, not performance failures. The final harness SHA passed both the dedicated correctness/typecheck workflow and repository Quality workflow before local timing.

## CP3-D authoritative summary

| comparator | scenario | Gelis req/s | comparator req/s | Gelis/comparator | Gelis-first | comparator-first | Gelis p50/p95/p99 ms | comparator p50/p95/p99 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Hono | static raw | 17,129 | 17,149 | 0.9943x | 0.9765x | 1.0059x | 2.708/4.186/6.617 | 2.744/4.334/6.570 |
| Elysia stable | static raw | 17,898 | 10,103 | 1.7720x | 1.8173x | 1.7689x | 2.661/3.854/6.380 | 4.752/7.360/9.122 |
| Elysia stable precompile | static raw | 17,709 | 10,057 | 1.7609x | 1.7576x | 1.7707x | 2.679/3.966/6.379 | 4.799/7.483/9.325 |
| Elysia next | static raw | 17,730 | 17,451 | 1.0066x | 1.0042x | 1.0164x | 2.682/4.043/6.523 | 2.717/4.047/6.431 |
| Elysia next AOT | static raw | 17,693 | 17,574 | 1.0060x | 1.0060x | 1.0090x | 2.676/3.940/6.463 | 2.697/4.023/6.532 |
| raw Bun native routes | static raw | 17,672 | 10,738 | 1.6489x | 1.6466x | 1.6578x | 2.677/4.021/6.339 | 4.499/7.030/8.997 |
| Hono | dynamic raw | 17,431 | 11,485 | 1.5350x | 1.5107x | 1.5355x | 2.714/4.083/6.391 | 4.186/6.754/8.689 |
| Elysia stable | dynamic raw | 17,383 | 9,441 | 1.8396x | 1.8387x | 1.8439x | 2.720/4.155/6.533 | 5.084/7.761/9.572 |
| Elysia stable precompile | dynamic raw | 17,414 | 9,445 | 1.8570x | 1.8357x | 1.8635x | 2.715/4.108/6.455 | 5.103/7.797/9.483 |
| Elysia next | dynamic raw | 17,592 | 17,418 | 1.0037x | 0.9977x | 1.0195x | 2.709/4.075/6.546 | 2.711/4.188/6.448 |
| Elysia next AOT | dynamic raw | 17,416 | 17,395 | 1.0039x | 1.0023x | 1.0145x | 2.716/4.123/6.571 | 2.741/4.078/6.458 |
| raw Bun native routes | dynamic raw | 17,483 | 10,449 | 1.6764x | 1.6705x | 1.6948x | 2.708/3.980/6.443 | 4.597/7.280/9.265 |
| Hono | static JSON | 17,296 | 16,639 | 1.0358x | 1.0268x | 1.0487x | 2.759/4.139/6.504 | 2.853/4.264/6.562 |
| Elysia stable | static JSON | 17,271 | 9,908 | 1.7462x | 1.7436x | 1.7495x | 2.745/4.097/6.508 | 4.863/7.531/9.262 |
| Elysia stable precompile | static JSON | 17,147 | 9,895 | 1.7354x | 1.7326x | 1.7438x | 2.759/4.131/6.548 | 4.863/7.612/9.275 |
| Elysia next | static JSON | 17,217 | 17,342 | 0.9872x | 0.9696x | 1.0024x | 2.754/4.142/6.629 | 2.745/4.099/6.492 |
| Elysia next AOT | static JSON | 17,161 | 17,305 | 0.9855x | 0.9833x | 1.0049x | 2.756/4.203/6.640 | 2.743/4.087/6.559 |
| raw Bun native routes | static JSON | 17,221 | 10,546 | 1.6282x | 1.6263x | 1.6463x | 2.751/4.157/6.600 | 4.568/7.163/9.131 |
| Hono | dynamic JSON | 17,058 | 11,008 | 1.5634x | 1.5288x | 1.5726x | 2.773/4.237/6.618 | 4.337/7.011/8.947 |
| Elysia stable | dynamic JSON | 16,998 | 9,266 | 1.8214x | 1.8244x | 1.8214x | 2.786/4.221/6.632 | 5.137/7.942/9.658 |
| Elysia stable precompile | dynamic JSON | 16,880 | 9,209 | 1.8194x | 1.8163x | 1.8515x | 2.799/4.292/6.615 | 5.202/8.032/9.690 |
| Elysia next | dynamic JSON | 16,865 | 16,933 | 0.9960x | 0.9849x | 1.0126x | 2.795/4.273/6.642 | 2.798/4.325/6.640 |
| Elysia next AOT | dynamic JSON | 16,835 | 16,891 | 0.9988x | 0.9882x | 1.0169x | 2.804/4.345/6.682 | 2.805/4.297/6.694 |
| raw Bun native routes | dynamic JSON | 16,929 | 10,212 | 1.6432x | 1.6349x | 1.6521x | 2.791/4.373/6.637 | 4.690/7.351/9.260 |

## CP2-H to CP3-D interpretation

CP3-C's same-run causal evidence already established a real production optimization at the normalization/pipeline level. CP3-D asks only how much of that optimization survives the socket/server HTTP path.

### Raw regression controls

The raw lanes remain in the same performance regime as CP2-H. There is no evidence of a material raw-response regression caused by CP3-C.

Against Elysia next, the raw ratios changed only from `1.0073x` to `1.0066x` for static raw and from `1.0018x` to `1.0037x` for dynamic raw. Against Elysia next AOT they changed from `0.9933x` to `1.0060x` and from `1.0126x` to `1.0039x` respectively. These are near-parity movements within a few percent.

The Hono static-raw cell shows a visible order split (`0.9765x` Gelis-first versus `1.0059x` comparator-first) and one low first sample, so its `0.9943x` primary ratio should be treated as order/system noise rather than evidence of a source-level raw-path regression. Other raw controls do not show a corresponding broad degradation.

### JSON translation

The JSON benefit is directionally visible but much smaller over HTTP than in the CP3-C micro/pipeline benchmark, as expected when routing, server, socket, and scheduler costs dominate more of the request path.

The most strategically relevant Elysia 2 comparisons moved toward parity:

| comparator | scenario | CP2-H | CP3-D | relative ratio movement |
| --- | --- | ---: | ---: | ---: |
| Elysia next | static JSON | 0.9811x | 0.9872x | +0.62% |
| Elysia next AOT | static JSON | 0.9753x | 0.9855x | +1.05% |
| Elysia next | dynamic JSON | 0.9843x | 0.9960x | +1.19% |
| Elysia next AOT | dynamic JSON | 0.9846x | 0.9988x | +1.44% |

Dynamic JSON is now effectively parity with Elysia 2 on this machine and protocol: Gelis is only about `0.40%` behind Elysia next source and about `0.12%` behind Elysia next AOT by the frozen primary ratio.

Static JSON also closes part of the previous gap, but Gelis remains about `1.28%` behind Elysia next source and about `1.45%` behind Elysia next AOT.

Against Hono, JSON remains ahead (`1.0358x` static, `1.5634x` dynamic). Against Elysia stable and stable precompile, Gelis remains materially ahead over real HTTP. The exact cross-run ratio movement against those slower implementations is not used to infer the CP3-C causal effect because comparator/system drift is of similar magnitude.

### Descriptive four-case aggregates

The four-workload geometric means are descriptive only and are not separate acceptance gates:

| comparator | CP2-H geomean | CP3-D geomean |
| --- | ---: | ---: |
| Hono 4.13.7 | 1.2557x | 1.2538x |
| Elysia 1.4.30 | 1.8233x | 1.7944x |
| Elysia 1.4.30 precompile | 1.8003x | 1.7925x |
| Elysia 2 beta.14 source | 0.9936x | 0.9983x |
| Elysia 2 beta.14 AOT | 0.9914x | 0.9985x |
| raw Bun native-routes reference | 1.6576x | 1.6491x |

The Elysia 2 aggregate therefore moved closer to exact HTTP parity without sacrificing the raw-response hot paths.

## Decision

**CP3-D authoritative local HTTP run: VALID.**

**CP3-D ACCEPTED.**

The correct classification is **HTTP improvement confirmed, but partially amortized by end-to-end HTTP overhead**.

CP3-C remains accepted on its stronger same-run causal micro/pipeline evidence. CP3-D independently confirms that the production change does not introduce a meaningful raw-response regression and that its JSON benefit survives into real HTTP enough to narrow the remaining Elysia 2 gap.

CP3-D does **not** establish a universal HTTP crown. Under this frozen Windows/i5-10500H/Bun 1.4.2/5,000-route protocol, Gelis remains marginally behind Elysia 2 in both JSON primary-ratio cells while retaining marginal raw-response leads. The remaining differences are now roughly within `0.1–1.5%` across those Elysia 2 comparisons.

No valid timing run should be repeated merely to seek a more favorable result.

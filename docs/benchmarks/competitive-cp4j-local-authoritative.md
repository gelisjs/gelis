# Competitive Performance v0.1 — CP4-J local authoritative result

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED AS PRODUCTION CANDIDATE / ACCEPTED AS DIRECT PRODUCTION EVIDENCE.**

The first valid local authoritative run completed on the frozen machine and harness. It failed two frozen static gates. The run must not be repeated merely because the result is unfavorable, and no threshold may be relaxed after seeing the result.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `a81f461cba0b125b90745cf1f7c07c81794e86bc`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- Candidate source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Routes per workload: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Correctness before timing: `24/24` PASS

## Authoritative medians

| cell                          |   production |    candidate |     ratio | result |
| ----------------------------- | -----------: | -----------: | --------: | ------ |
| static-only raw               |  785.1 ns/op |  843.8 ns/op | `1.0747x` | FAIL   |
| mixed static raw              |  790.0 ns/op |  808.5 ns/op | `1.0234x` | FAIL   |
| mixed dynamic raw             |  964.1 ns/op |  875.4 ns/op | `0.9080x` | PASS   |
| mixed dynamic JSON            |  727.5 ns/op |  681.5 ns/op | `0.9369x` | PASS   |
| mixed same-length dynamic raw |  951.2 ns/op |  950.6 ns/op | `0.9994x` | PASS   |
| pure trailing dynamic raw     |  983.3 ns/op |  885.6 ns/op | `0.9006x` | PASS   |
| pure trailing dynamic JSON    |  752.5 ns/op |  682.3 ns/op | `0.9067x` | PASS   |
| generic dynamic raw           | 1171.0 ns/op | 1203.6 ns/op | `1.0278x` | PASS   |
| forced collision raw          | 1021.4 ns/op |  987.8 ns/op | `0.9671x` | PASS   |
| ALL dynamic raw               |  966.0 ns/op |  891.9 ns/op | `0.9232x` | PASS   |
| static registration           |     1.242 ms |     1.245 ms | `1.0030x` | PASS   |
| static retained heap delta    | 619117 bytes | 617921 bytes | `0.9981x` | PASS   |

Mixed dynamic geomean: `0.9223x` — PASS against the frozen `<= 0.9800x` gate.

## Frozen production gates

| gate                          | candidate / production |        limit | result |
| ----------------------------- | ---------------------: | -----------: | ------ |
| static-only raw               |              `1.0747x` | `<= 1.0200x` | FAIL   |
| mixed static raw              |              `1.0234x` | `<= 1.0200x` | FAIL   |
| mixed dynamic raw guard       |              `0.9080x` | `<= 1.0200x` | PASS   |
| mixed dynamic JSON guard      |              `0.9369x` | `<= 1.0200x` | PASS   |
| mixed dynamic geomean         |              `0.9223x` | `<= 0.9800x` | PASS   |
| mixed same-length dynamic raw |              `0.9994x` | `<= 1.0200x` | PASS   |
| pure trailing dynamic raw     |              `0.9006x` | `<= 0.9400x` | PASS   |
| pure trailing dynamic JSON    |              `0.9067x` | `<= 0.9500x` | PASS   |
| generic dynamic raw           |              `1.0278x` | `<= 1.0300x` | PASS   |
| forced collision raw          |              `0.9671x` | `<= 1.1500x` | PASS   |
| ALL dynamic raw               |              `0.9232x` | `<= 1.0500x` | PASS   |
| static registration           |              `1.0030x` | `<= 1.0500x` | PASS   |
| static retained heap          |              `0.9981x` | `<= 1.0500x` | PASS   |

## Interpretation

The composed CP4-H + CP4-I routing mechanism is strongly beneficial for the dynamic workloads measured here and does not create a registration or retained-heap blocker. It is nevertheless rejected as a production candidate because production acceptance requires every frozen gate to pass.

The direct production comparison also invalidates any attempt to infer production acceptance by multiplying ratios from separate decomposition runs. CP4-H and CP4-I remain useful mechanism evidence, but only this direct production-vs-candidate run is authoritative for promotion.

The next investigation should isolate the static request path while preserving the dynamic mechanism. Production performs `pathnameFromRequestUrl(request.url)` followed by `router.match(...)`; the rejected candidate routes ordinary Router requests through `matchRequestUrl(...)`. The static-only regression is therefore the primary residual attribution target. Mixed-static remains a smaller secondary residual.

## Evidence rule

Do not rerun CP4-J to seek a more favorable result. A future candidate must receive a new frozen identity and new pre-timing gates before its first authoritative timing run.

# Competitive Performance v0.1 — CP4-K static-only handoff decomposition freeze

## Purpose

CP4-K isolates the dominant residual from the failed CP4-J full production acceptance: pure static request dispatch. The control is the exact rejected CP4-I source, and the candidate changes only the runtime-created `FAST_MAP_STATIC_ONLY` request path so it exits before the full request-URL offset parser and performs a production-shaped `pathnameFromRequestUrl(url)` plus exact static-map lookup.

This is a decomposition experiment, not production acceptance. Mixed, trailing, generic, collision, and ALL-dynamic cells are secondary regression guards.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `ac7cc2fc5eb381f703b410a1d3f9cc3a958106b8`
- Routes per workload: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Local authoritative machine: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz

## Recovery derivation

CP4-J measured the control-equivalent composed source at `1.0747x` production for static-only raw. To reach the frozen production gate `<= 1.0200x`, a candidate/control ratio of at most `1.0200 / 1.0747 = 0.949102...` is required. The pre-timing CP4-K recovery gate is therefore frozen at `<= 0.9491x`.

No chained ratio can promote a candidate. This threshold is only a viability discriminator; any eventual production candidate must still pass a new direct production acceptance run.

## Frozen cells

1. static-only raw
2. mixed static raw
3. mixed dynamic raw
4. mixed dynamic JSON
5. mixed same-length dynamic raw
6. pure trailing dynamic raw
7. pure trailing dynamic JSON
8. generic dynamic raw
9. forced collision raw
10. ALL dynamic raw

Correctness requires control and candidate to pass every cell before timing: `20/20` probes.

## Frozen gates

| gate                                | candidate / control |        limit |
| ----------------------------------- | ------------------: | -----------: |
| static-only recovery                |   candidate/control | `<= 0.9491x` |
| mixed-static guard                  |   candidate/control | `<= 1.0200x` |
| mixed dynamic raw guard             |   candidate/control | `<= 1.0200x` |
| mixed dynamic JSON guard            |   candidate/control | `<= 1.0200x` |
| mixed same-length dynamic raw guard |   candidate/control | `<= 1.0200x` |
| pure trailing dynamic raw guard     |   candidate/control | `<= 1.0200x` |
| pure trailing dynamic JSON guard    |   candidate/control | `<= 1.0200x` |
| generic dynamic raw guard           |   candidate/control | `<= 1.0200x` |
| forced collision raw guard          |   candidate/control | `<= 1.0200x` |
| ALL dynamic raw guard               |   candidate/control | `<= 1.0200x` |

## Interpretation contract

- PASS requires every frozen gate to pass in the first valid local authoritative run.
- A PASS only proves the static-only handoff mechanism is viable for composition into a later candidate.
- A FAIL rejects this mechanism as the static-only recovery path. No threshold may be relaxed and no run may be repeated merely because the result is unfavorable.
- Registration and retained heap are intentionally excluded because CP4-K changes only per-request dispatch and does not alter table representation or registration.
- CI may validate formatting, typecheck, tests, and probe-only correctness. CI timing is not authoritative and must not be used for acceptance.

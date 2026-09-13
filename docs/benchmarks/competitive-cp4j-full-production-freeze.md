# Competitive Performance v0.1 — CP4-J full production acceptance freeze

## Purpose

CP4-J is the full production acceptance for the composed CP4-H + CP4-I routing mechanism. It measures the exact frozen CP4-I source directly against the unchanged frozen production source. This is not a chained-ratio inference: acceptance is based only on the direct local authoritative run produced by this harness.

The candidate contains the CP4-H primary `fastMapKind` discriminator and the CP4-I one-sided mixed static upper-bound discriminator. No CP4-G app-dispatch normalization is included.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- Candidate source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Routes per workload: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Local authoritative machine: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz

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
11. static registration
12. static retained heap delta

Correctness requires production and candidate to pass every cell before timing: `24/24` probes.

## Frozen production gates

These are the unchanged full production gates used from CP4-D onward.

| gate                          | candidate / production |        limit |
| ----------------------------- | ---------------------: | -----------: |
| static-only raw               |   candidate/production | `<= 1.0200x` |
| mixed static raw              |   candidate/production | `<= 1.0200x` |
| mixed dynamic raw guard       |   candidate/production | `<= 1.0200x` |
| mixed dynamic JSON guard      |   candidate/production | `<= 1.0200x` |
| mixed dynamic geomean         |   candidate/production | `<= 0.9800x` |
| mixed same-length dynamic raw |   candidate/production | `<= 1.0200x` |
| pure trailing dynamic raw     |   candidate/production | `<= 0.9400x` |
| pure trailing dynamic JSON    |   candidate/production | `<= 0.9500x` |
| generic dynamic raw           |   candidate/production | `<= 1.0300x` |
| forced collision raw          |   candidate/production | `<= 1.1500x` |
| ALL dynamic raw               |   candidate/production | `<= 1.0500x` |
| static registration           |   candidate/production | `<= 1.0500x` |
| static retained heap          |   candidate/production | `<= 1.0500x` |

## Interpretation contract

- PASS requires every frozen production gate to pass in the first valid local authoritative run.
- A PASS makes the exact source `c18f231374d0008b7cc3e01bacbf9f81aff9a273` eligible for production promotion, subject to durable evidence recording and final repository hygiene.
- A FAIL rejects this exact source as a production candidate. No gate may be relaxed and no run may be repeated merely because the result is unfavorable.
- Registration and retained heap are first-class production gates and cannot be inferred from the CP4-I viability run.
- CI may validate formatting, typecheck, tests, and probe-only correctness. CI timing is not authoritative and must not be used for acceptance.

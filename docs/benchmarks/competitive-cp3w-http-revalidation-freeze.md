# Competitive Performance v0.1 — CP3-W HTTP revalidation freeze

## Purpose

CP3-V passed all seven frozen production-shape gates using the single-index trailing-prefix fingerprint router plus the direct-string default-success response path. CP3-W revalidates that candidate under the previously accepted CP3-K real HTTP protocol before any production promotion.

## Frozen source identity

- production baseline: `8e43aad09759d60378b3fc174292850057ccfba3`
- CP3-V candidate source: `979821c709e809e29018791ce0fe212cded04162`
- historical CP3-K harness tree source: `42dbba8e20c45024524c805a717751cbc8dcddfb`
- Bun: exactly `1.4.2`
- oha: exactly `1.16.0`
- Hono: exactly `4.13.7`
- Elysia stable: exactly `1.4.30`
- Elysia next: exactly `2.0.0-beta.14`

The CP3-W branch may restore `bench/competitive/**` from the exact historical CP3-K tree and adapt phase labels and Gelis source guards only. The HTTP sampling protocol must not change.

## Frozen HTTP protocol

- routes: `5,000`
- scenarios:
  - `static-raw`
  - `dynamic-raw`
  - `static-json`
  - `dynamic-json`
- comparators:
  - Hono `4.13.7`
  - Elysia stable `1.4.30`
  - Elysia stable precompile
  - Elysia next `2.0.0-beta.14`
  - Elysia next AOT
  - raw Bun
- `7` mirrored fresh-server pairs per comparator/scenario cell
- order alternates Gelis-first and comparator-first
- warmup: `1s`, `10` connections
- measurement: `5s`, `50` connections
- ratio: Gelis req/s / comparator req/s
- every measured sample must have `100%` HTTP success
- correctness probe must verify body, status, content type, and content encoding exactly as CP3-K did

## Evidence policy

CP3-W is a real-HTTP revalidation, not a new microbenchmark gate. No post-hoc threshold may be invented after timing. The completed local run is authoritative if environment/source identity, correctness, and protocol are valid.

Interpretation must compare CP3-W medians with the accepted CP3-K historical medians while acknowledging run-to-run HTTP noise. A valid unfavorable result is preserved and not rerun merely because it is unfavorable.

CP3-V is not promoted to the production baseline until CP3-W real-HTTP evidence is reviewed.

## Local probe hygiene

The historical Elysia next AOT probe generates `bench/competitive/elysia-v2-aot/generated/`. After a successful local correctness probe, remove that generated directory before starting the authoritative timed run so that the harness clean-worktree guard remains valid. This cleanup does not change the timed protocol.

## Completion markers

Probe:

`CP3-W CORRECTNESS PROBE: PASS`

Timed run:

`CP3-W LOCAL HTTP REVALIDATION RUN: COMPLETE`

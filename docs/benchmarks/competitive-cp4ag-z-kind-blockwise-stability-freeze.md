# Competitive Performance v0.1 — CP4-AG Z/KIND blockwise stability freeze

Date: 2026-09-13

## Purpose

CP4-AG is a measurement-only stability experiment. It exists because CP4-AD and CP4-AF measured opposite KIND-only / CP4-Z directions on several cells even though both used the same exact source SHAs and balanced fresh-worker protocols.

The primary unresolved cells are generic dynamic raw and static registration. Static-only, mixed-static, mixed-dynamic, trailing dynamic, and ALL dynamic remain as controls so the source-effect sign is not interpreted from isolated cells.

## Frozen sources

- CP4-Z: `1b4057ad9d12bc28d2ab2ca7917924368fe99444`
- KIND-only: `408f9856f814184ca0204aa49d3812af8660f077`

KIND-only must differ from CP4-Z under `src/**` only at `src/runtime/router.ts`.

## Frozen environment

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes: `5,000`
- Local user machine remains authoritative for timing.
- CI may run correctness-only probes but must not run timing.

## Frozen cells

1. static-only raw
2. mixed static raw
3. mixed dynamic raw
4. pure trailing dynamic raw
5. generic dynamic raw
6. ALL dynamic raw
7. static registration

These are the same seven cells used by CP4-AD and CP4-AF.

## Frozen sampling protocol

For every cell:

- two sources only: CP4-Z and KIND-only;
- `4` blocks;
- `6` mirrored fresh-worker pairs per block;
- `24` measurements per source per cell;
- every block contains exactly `3` Z→KIND pairs and `3` KIND→Z pairs;
- worker semantics remain identical for both sources;
- no production source is included because this phase measures component-effect stability, not production acceptance.

The harness reports the overall median, p25, p75, min, max, overall KIND / Z ratio, and four independently summarized blockwise KIND / Z ratios.

## Frozen interpretation rule

CP4-AG has no acceptance threshold and cannot promote any source.

The main question is whether the sign of KIND / Z is stable across blocks and consistent with either CP4-AD or CP4-AF. A source-effect claim should be considered structurally weak if the blockwise ratios materially cross `1.0000x` or if the full-run direction conflicts again with prior balanced attribution.

A favorable result does not reopen CP4-AE and does not change CP4-Z or CP4-AE classifications. Any future production candidate requires a separate direct-production acceptance phase frozen before timing.

## Run discipline

- Run local correctness probe first.
- After exact identity and `14/14` correctness PASS, run timing exactly once.
- The first valid completed local timed run is authoritative.
- Do not rerun because a direction is surprising, unfavorable, or close to `1.0000x`.
- Preserve the result as evidence before choosing the next architecture step.

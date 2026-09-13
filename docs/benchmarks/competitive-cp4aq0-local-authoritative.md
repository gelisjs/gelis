# CP4-AQ0 local benchmark stability calibration evidence

## Classification

**VALID / AUTHORITATIVE / CALIBRATION COMPLETE / NO PERFORMANCE RECLASSIFICATION**

CP4-AQ0 compares byte-identical production source against itself to measure the local benchmark noise floor. It is descriptive only and does not alter any prior Gelis performance acceptance or promotion classification.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `884c52a2c1587378b443f16d204bb094c58e14d9`
- Source A: `5d9698d6b8d368ddcff358fc2645435b93c0c062`
- Source B: `5d9698d6b8d368ddcff358fc2645435b93c0c062`
- Routes: `5,000`
- Blocks: `5`
- Pairs/block: `8`
- Pairs/cell: `40`
- Samples/source/cell: `40` fresh-worker measurements
- Order: `4 A→B + 4 B→A` per block

Local correctness probe passed `24/24` before timing.

## Same-source aggregate median ratios

These values are recomputed as `median(B) / median(A)` from the authoritative absolute-metric table.

| cell                          | median(B) / median(A) |
| ----------------------------- | --------------------: |
| static-only raw               |               0.9967x |
| mixed static raw              |               1.0028x |
| mixed dynamic raw             |               1.0037x |
| mixed dynamic JSON            |               1.0030x |
| mixed same-length dynamic raw |               1.0049x |
| pure trailing dynamic raw     |               0.9930x |
| pure trailing dynamic JSON    |               0.9950x |
| generic dynamic raw           |               0.9987x |
| forced collision raw          |               1.0088x |
| ALL dynamic raw               |               1.0041x |
| static registration           |               1.0080x |
| static retained heap delta    |               1.0000x |

All hotpath/registration aggregate median ratios stayed within approximately `-0.70%` to `+0.88%` despite byte-identical sources.

## Pairwise same-source noise

Individual fresh-worker pair ratios were substantially noisier than aggregate medians.

| cell                          | paired median |     p05 |     p95 | outside ±2% |
| ----------------------------- | ------------: | ------: | ------: | ----------: |
| static-only raw               |       0.9994x | 0.9289x | 1.0468x |       21/40 |
| mixed static raw              |       1.0008x | 0.9371x | 1.0830x |       23/40 |
| mixed dynamic raw             |       1.0123x | 0.9214x | 1.0937x |       24/40 |
| mixed dynamic JSON            |       1.0039x | 0.9311x | 1.0802x |       21/40 |
| mixed same-length dynamic raw |       1.0018x | 0.9534x | 1.0998x |       23/40 |
| pure trailing dynamic raw     |       0.9838x | 0.8918x | 1.0562x |       27/40 |
| pure trailing dynamic JSON    |       0.9992x | 0.8980x | 1.0961x |       22/40 |
| generic dynamic raw           |       1.0076x | 0.9100x | 1.0831x |       30/40 |
| forced collision raw          |       1.0066x | 0.9222x | 1.1758x |       21/40 |
| ALL dynamic raw               |       1.0074x | 0.9499x | 1.1117x |       21/40 |
| static registration           |       0.9961x | 0.8993x | 1.1041x |       31/40 |
| static retained heap delta    |       1.0000x | 0.9993x | 1.0008x |        0/40 |

Global descriptive diagnostics from the frozen harness:

- worst paired p05 deflation below `1.0`: `10.82%`
- worst paired p95 inflation above `1.0`: `17.58%`
- worst two-sided p05-p95 radius: `17.58%` (`forced collision raw`)

## Interpretation

The local machine remains useful for Gelis performance work, but a single fresh-worker A/B pair is not a sufficiently stable observation for `1–2%` decisions. The older `12 samples/source` direct-production protocol is also too small for consistently resolving borderline `~2%` gates on this host.

The stronger signal is the aggregate distribution across many fresh workers. With `40 samples/source`, byte-identical source aggregate medians remained within about `±0.9%` across hotpath and registration cells, while individual pair ratios had large tails.

Therefore future acceptance protocol should not gate on individual pair ratios. The next calibration phase should evaluate a hardened local runner using fixed Windows CPU affinity/high process priority plus block ratio-of-medians and an uncertainty interval around the aggregate estimator. This change is prospective and does not retroactively alter CP4-AO or CP4-AP.

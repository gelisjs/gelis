# CP4-AA local authoritative attribution

Classification: **VALID / AUTHORITATIVE / ATTRIBUTION COMPLETE**.

This run is attribution-only. It does not alter the prior CP4-X or CP4-Z acceptance classifications.

## Identity

- Harness SHA: `54ce713b62bac44130b8dcaea845557baead28ed`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-X source: `efaa228231c920fee78053edeb5c8c094f324aca`
- CP4-Z source: `1b4057ad9d12bc28d2ab2ca7917924368fe99444`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel Core i5-10500H @ 2.50GHz
- Routes: 5,000
- Samples: 12 balanced fresh-worker triplets per cell

## Direct ratios vs production

| Cell | CP4-X | CP4-Z | Z / X |
| --- | ---: | ---: | ---: |
| static-only raw | 1.0197x | 1.0132x | 0.9936x |
| mixed static raw | 1.0426x | 1.0039x | 0.9629x |
| mixed dynamic raw | 0.9161x | 0.9230x | 1.0076x |
| pure trailing dynamic raw | 0.9206x | 0.9040x | 0.9820x |
| generic dynamic raw | 1.0045x | 1.0177x | 1.0131x |
| ALL dynamic raw | 0.9049x | 0.9077x | 1.0031x |
| static registration | 0.9766x | 0.9700x | 0.9933x |

## Interpretation

- CP4-Z robustly restores mixed-static performance relative to CP4-X in the same balanced run (`1.0039x` vs production; `0.9629x` vs CP4-X).
- CP4-Z static-only also projects below the frozen production guard in this same-run attribution (`1.0132x`).
- CP4-Z static registration is faster than production in this same-run attribution (`0.9700x`).
- The prior CP4-Z direct acceptance failures for static-only and registration are therefore not reproduced here and are consistent with run/code-shape sensitivity.
- CP4-Z remains rejected for production promotion because prior direct acceptance is authoritative and cannot be overwritten by attribution.

Final marker from the authoritative local run:

`CP4-AA LOCAL PRODUCTION-X-Z ATTRIBUTION RUN: COMPLETE`

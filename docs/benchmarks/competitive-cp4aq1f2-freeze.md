# CP4-AQ1F2 freeze

This phase is a same-source benchmark-method calibration only.

Frozen inputs: Bun 1.4.2, revision 744846f844374847c902b5e7fd59b4342a51ef99, source A and B both 5d9698d6b8d368ddcff358fc2645435b93c0c062, 5,000 routes, five representative hotpath cells.

Sampling is fixed at 8 paired workers per cell and 8 symmetric cycles per worker. Each cycle contains four timed legs in ABBA or BAAB order. A and B use the same iteration count derived before timed cycles. The primary observation from each paired worker is the median of its 8 cycle ratios.

Every cell must satisfy: primary bias at most 1.00 percent, bootstrap 95 percent interval fully inside 0.9850x to 1.0150x, orientation spread at most 1.00 percent, and maximum paired-worker deviation at most 2.00 percent.

All five cells must pass before a full AQ1G calibration is allowed. A completed failure is final for this unchanged mechanism. An incomplete run is not a viability result.

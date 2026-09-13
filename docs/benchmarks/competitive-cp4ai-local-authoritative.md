# Competitive Performance v0.1 — CP4-AI local authoritative result

Date: 2026-09-13

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED FOR PRODUCTION PROMOTION / ACCEPTED AS DIRECT PRODUCTION EVIDENCE**

This is the first valid completed local timed CP4-AI run and is authoritative as-is. It must not be rerun for result selection, and the frozen gates must not be changed after observing the result.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `722cd386d349e1daa0ca974af08c4c70db10cabf`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-Z source: `1b4057ad9d12bc28d2ab2ca7917924368fe99444`
- Candidate source: `a7751059eef1d3074e6e0a1c2d227b49889affe4`
- Routes: `5,000`
- Sampling: `12 balanced fresh-worker triplets/cell`
- Source order: all six permutations, each repeated twice per cell

Local correctness probe before timing: `PASS (36/36)`.

## Overall distributions

```text
cell                           variant      median    p25       p75       min       max       unit
static-only-raw                production    811.2     805.0     823.3     775.5    1061.6    ns/op
static-only-raw                cp4z          838.2     824.2     848.7     801.8     987.7    ns/op
static-only-raw                candidate     814.8     794.2     833.9     785.4    1005.5    ns/op
mixed-static-raw               production    792.4     779.9     796.9     773.9     846.5    ns/op
mixed-static-raw               cp4z          841.1     802.3     861.7     795.3     924.1    ns/op
mixed-static-raw               candidate     824.7     808.1     875.9     795.5     951.5    ns/op
mixed-dynamic-raw              production   1058.1    1007.8    1085.2     938.1    1193.0    ns/op
mixed-dynamic-raw              cp4z          953.0     908.8    1001.7     863.4    1045.6    ns/op
mixed-dynamic-raw              candidate     954.2     935.9    1007.5     878.0    1091.3    ns/op
mixed-dynamic-json             production    753.8     742.9     781.1     714.7     913.0    ns/op
mixed-dynamic-json             cp4z          697.5     684.5     717.3     671.2     753.0    ns/op
mixed-dynamic-json             candidate     686.9     678.7     707.8     665.0     756.2    ns/op
mixed-same-length-dynamic-raw  production    963.4     951.8     972.0     938.1    1100.5    ns/op
mixed-same-length-dynamic-raw  cp4z          965.9     949.1     983.7     937.7    1078.8    ns/op
mixed-same-length-dynamic-raw  candidate     973.6     952.2    1003.1     939.3    1047.0    ns/op
trailing-dynamic-raw           production    954.1     943.9     983.2     934.6    1010.1    ns/op
trailing-dynamic-raw           cp4z          883.7     868.0     890.1     855.0     919.3    ns/op
trailing-dynamic-raw           candidate     889.4     866.5     907.6     850.8     916.8    ns/op
trailing-dynamic-json          production    748.8     730.0     770.6     721.6     854.3    ns/op
trailing-dynamic-json          cp4z          680.2     670.0     685.4     656.0     788.9    ns/op
trailing-dynamic-json          candidate     689.1     682.2     706.6     658.6     706.9    ns/op
generic-dynamic-raw            production   1165.3    1151.5    1206.6    1144.4    1286.5    ns/op
generic-dynamic-raw            cp4z         1143.6    1130.9    1159.3    1115.1    1174.2    ns/op
generic-dynamic-raw            candidate    1186.2    1157.4    1211.5    1137.9    1259.0    ns/op
collision-dynamic-raw          production   1039.0    1033.0    1072.0    1012.9    1247.6    ns/op
collision-dynamic-raw          cp4z          964.7     954.1     992.7     944.5    1058.4    ns/op
collision-dynamic-raw          candidate     974.1     955.7     982.4     937.5    1210.0    ns/op
all-dynamic-raw                production    990.1     955.0    1067.7     935.8    1087.8    ns/op
all-dynamic-raw                cp4z          930.8     909.4     983.1     877.7    1032.7    ns/op
all-dynamic-raw                candidate     960.1     912.2     979.6     870.7    1071.1    ns/op
static-registration            production      1.305     1.264     1.459     1.238     1.557  ms
static-registration            cp4z            1.293     1.241     1.404     1.221     2.132  ms
static-registration            candidate       1.323     1.258     1.403     1.229     1.573  ms
static-memory                  production  619117    619117    619453    619117    619453      bytes
static-memory                  cp4z        618033    618005    618369    617921    619073      bytes
static-memory                  candidate   618362    618362    618698    618250    618698      bytes
```

## Direct same-run attribution ratios

```text
comparison                       Z / production   candidate / production   candidate / Z
static-only raw                  1.0333x          1.0044x                  0.9720x
mixed static raw                 1.0614x          1.0407x                  0.9805x
mixed dynamic raw                0.9007x          0.9018x                  1.0012x
mixed dynamic JSON               0.9253x          0.9112x                  0.9848x
mixed same-length dynamic raw    1.0026x          1.0106x                  1.0080x
pure trailing dynamic raw        0.9263x          0.9322x                  1.0064x
pure trailing dynamic JSON       0.9083x          0.9203x                  1.0132x
generic dynamic raw              0.9814x          1.0179x                  1.0372x
forced collision raw             0.9285x          0.9375x                  1.0097x
ALL dynamic raw                  0.9400x          0.9697x                  1.0315x
static registration              0.9911x          1.0139x                  1.0231x
static retained heap delta       0.9982x          0.9988x                  1.0005x
```

## Frozen direct-production gates

```text
gate                              candidate / production   limit       result
static-only raw                   1.0044x                  <=1.0200x   PASS
mixed static raw                  1.0407x                  <=1.0200x   FAIL
mixed dynamic raw guard           0.9018x                  <=1.0200x   PASS
mixed dynamic JSON guard          0.9112x                  <=1.0200x   PASS
mixed dynamic raw/JSON geomean    0.9065x                  <=0.9800x   PASS
mixed same-length dynamic raw     1.0106x                  <=1.0200x   PASS
pure trailing dynamic raw         0.9322x                  <=0.9400x   PASS
pure trailing dynamic JSON        0.9203x                  <=0.9500x   PASS
generic dynamic raw               1.0179x                  <=1.0300x   PASS
forced collision raw              0.9375x                  <=1.1500x   PASS
ALL dynamic raw                   0.9697x                  <=1.0500x   PASS
static registration               1.0139x                  <=1.0500x   PASS
static retained heap              0.9988x                  <=1.0500x   PASS
```

Final harness result:

`CP4-AI LAZY-CAPABILITY DIRECT PRODUCTION ACCEPTANCE GATE: FAIL`

## Interpretation

CP4-AI succeeds at the structural objective that motivated the lazy-capability experiment: static-only requests return to near-production cost. The static-only ratio improves from CP4-Z / production `1.0333x` to candidate / production `1.0044x`, while candidate / CP4-Z is `0.9720x`. This is direct same-run evidence that keeping the request-URL capability inactive for static-only applications removes the residual static-only regression.

The dynamic benefit is preserved. Mixed dynamic raw is `0.9018x` production, mixed dynamic JSON is `0.9112x`, their geomean is `0.9065x`, trailing raw is `0.9322x`, trailing JSON is `0.9203x`, collision is `0.9375x`, and ALL dynamic is `0.9697x`. The candidate therefore retains the main dynamic advantage of the CP4-Z lineage while paying essentially no static-only penalty.

The exact candidate nevertheless fails production acceptance because mixed-static remains `1.0407x` versus production, above the frozen `<=1.0200x` gate. CP4-AI improves that cell materially relative to CP4-Z in the same run (`0.9805x` candidate / Z), but the remaining gap to production is still too large. The failure must stand; it cannot be rescued by the 12 passing gates.

This result isolates the next bottleneck sharply. Static-only capability activation is no longer the problem. The residual is the exact-static request path inside a method table that has already activated dynamic request-URL matching. Future work should target that mixed-table static-hit path specifically while leaving the static-only lazy split and the CP4-Z dynamic path unchanged.

Generic dynamic (`1.0179x`) and ALL dynamic (`0.9697x`) both still pass production gates even though they are slower than CP4-Z in this run. Those candidate/Z regressions are attribution signals to protect in future work, not reasons to reinterpret the acceptance result.

## Consequence

- CP4-AI must not be rerun for result selection.
- Candidate `a7751059eef1d3074e6e0a1c2d227b49889affe4` is rejected for production promotion because mixed-static failed its frozen direct-production gate.
- The lazy request-URL capability mechanism is accepted as positive structural evidence: it solved static-only without sacrificing the direct-production dynamic gates.
- The next source experiment should inherit the CP4-AI lazy capability split and change only the mixed-table exact-static hit path.
- Dead-metadata deletion, static-only handoff, and static capability-elision lines remain closed.
- Any next candidate requires a new frozen phase, correctness validation, and independent local performance acceptance.

Completion marker:

`CP4-AI LOCAL LAZY-CAPABILITY PRODUCTION ACCEPTANCE RUN: COMPLETE`

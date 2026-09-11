# Competitive Performance v0.1 — CP3-I local authoritative result

## Identity

- Classification: VALID / ACCEPTED as decomposition evidence
- Harness SHA: `c245cf1c2f7bcc80a1950411d7d7941be39a39a5`
- Frozen Gelis production source: `98d8c00bfda8913a951bdf8780e136672646a90c`
- Runtime: Bun 1.4.2
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Routes: 5,000
- Samples: 11 fresh worker processes per cell
- Local quality gate: 728 pass, 0 fail
- Correctness probe: PASS (18/18)
- Authoritative run count: one

## Request lookup strategy cells

| cell                      | median ns/op |   p25 |   p75 |   min |   max |
| ------------------------- | -----------: | ----: | ----: | ----: | ----: |
| bounds-fast-static        |         22.2 |  21.7 |  22.9 |  21.4 |  23.2 |
| bounds-fast-dynamic       |         23.7 |  23.5 |  24.4 |  22.9 |  25.4 |
| pathname-current-static   |         61.4 |  60.5 |  63.8 |  59.9 | 130.1 |
| pathname-current-dynamic  |         67.5 |  66.8 |  70.4 |  65.0 |  72.3 |
| pathname-minimal-static   |         38.6 |  38.1 |  38.9 |  37.5 |  39.5 |
| pathname-minimal-dynamic  |         40.7 |  40.5 |  42.0 |  40.1 |  43.6 |
| map-static-request        |        124.5 | 123.0 | 128.5 | 118.3 | 135.5 |
| object-static-request     |        141.1 | 133.6 | 152.4 | 131.4 | 173.8 |
| map-trailing-request      |        176.4 | 171.9 | 177.5 | 165.0 | 184.0 |
| object-trailing-request   |        175.8 | 168.7 | 202.9 | 164.6 | 216.4 |
| router-trailing-stable    |         28.5 |  27.4 |  30.2 |  26.0 |  32.3 |
| router-generic-stable     |        188.9 | 187.9 | 194.2 | 181.2 | 265.9 |
| router-trailing-request   |        255.3 | 252.7 | 261.2 | 248.6 | 285.3 |
| router-generic-request    |        323.8 | 320.9 | 328.8 | 318.0 | 338.0 |
| dispatch-trailing-stable  |         67.3 |  66.1 |  70.9 |  61.9 |  75.3 |
| dispatch-generic-stable   |        212.6 | 209.7 | 214.3 | 202.5 | 224.5 |
| dispatch-trailing-request |        284.2 | 280.0 | 286.6 | 274.1 | 305.7 |
| dispatch-generic-request  |        338.7 | 335.1 | 343.6 | 331.9 | 407.0 |

## Derived diagnostics

These diagnostics are non-additive and are engineering direction only.

| diagnostic                                    |    value |
| --------------------------------------------- | -------: |
| minimal pathname / current pathname static    |  0.6288x |
| minimal pathname / current pathname dynamic   |  0.6027x |
| current pathname static - bounds lower bound  |  39.2 ns |
| current pathname dynamic - bounds lower bound |  43.8 ns |
| object / Map static request lookup            |  1.1335x |
| object / Map trailing request lookup          |  0.9967x |
| generic / trailing router stable              |  6.6205x |
| generic / trailing router request             |  1.2684x |
| trailing router fresh-path penalty            | 226.8 ns |
| generic router fresh-path penalty             | 135.0 ns |
| generic / trailing dispatch stable            |  3.1597x |
| generic / trailing dispatch request           |  1.1917x |
| trailing dispatch fresh-path penalty          | 217.0 ns |
| generic dispatch fresh-path penalty           | 126.1 ns |

## Conclusions

1. Replacing `Map` with a null-prototype object is rejected as the next optimization direction. Static request lookup was about 13% slower and trailing lookup was effectively equal.
2. Replacing the specialized trailing-param fast path with the current generic Gelis trie is rejected. Generic routing was substantially slower for both stable and request-derived paths.
3. The specialized trailing-param fast path remains the preferred current structure for this route class.
4. URL pathname extraction is a real low-risk target. The minimal request-oriented extractor measured about 37–40% lower isolated cost than the current generic extractor in these cells.
5. The URL extraction improvement cannot explain the full fresh-path penalty. Lookup/string-materialization interaction remains a later structural target.
6. A production candidate must preserve generic URL semantics. The benchmark's fixed-offset minimal extractor is evidence, not production code.
7. The next candidate should specialize normalized `Request.url` HTTP/HTTPS extraction while retaining the existing generic URL fallback, then require both semantic correctness and same-run production-shaped performance evidence before promotion.

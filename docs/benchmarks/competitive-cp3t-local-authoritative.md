# Competitive Performance v0.1 — CP3-T local authoritative pipeline translation decomposition

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `657e80d840bc3266ed71775305a20ff745cf2fce`
- Production source: `8e43aad09759d60378b3fc174292850057ccfba3`
- Candidate source: `77168cea5056c50bd7188b2dace17f72f7a01514`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Correctness probe: `PASS (18/18)`
- Completion marker: `CP3-T LOCAL PIPELINE TRANSLATION RUN: COMPLETE`

## Pipeline translation cells

| cell                   | variant    | median ns/op |   p25 |   p75 |   min |    max |
| ---------------------- | ---------- | -----------: | ----: | ----: | ----: | -----: |
| router-dynamic         | production |        219.6 | 216.5 | 234.0 | 209.5 |  244.2 |
| router-dynamic         | candidate  |        183.6 | 177.3 | 188.1 | 174.9 |  194.3 |
| handler-string-stable  | production |        218.2 | 215.6 | 222.3 | 213.2 |  232.1 |
| handler-string-stable  | candidate  |        181.6 | 179.8 | 184.8 | 177.3 |  191.2 |
| handler-string-param   | production |        219.4 | 216.9 | 220.4 | 213.3 |  224.3 |
| handler-string-param   | candidate  |        183.1 | 182.2 | 190.3 | 181.0 |  200.9 |
| handler-json-stable    | production |        219.1 | 216.7 | 222.8 | 214.9 |  313.0 |
| handler-json-stable    | candidate  |        184.0 | 180.3 | 187.5 | 177.7 |  212.2 |
| handler-json-param     | production |        235.3 | 224.4 | 260.2 | 217.0 |  367.9 |
| handler-json-param     | candidate  |        195.7 | 183.8 | 232.3 | 180.8 |  297.2 |
| pipeline-string-stable | production |        933.8 | 914.7 | 948.2 | 907.1 | 1038.6 |
| pipeline-string-stable | candidate  |        898.4 | 880.6 | 922.3 | 872.3 |  982.2 |
| pipeline-string-param  | production |        983.7 | 967.9 | 998.1 | 950.3 | 1059.4 |
| pipeline-string-param  | candidate  |        968.0 | 953.7 | 985.6 | 940.8 | 1113.9 |
| pipeline-json-stable   | production |        749.8 | 726.8 | 798.4 | 707.0 |  875.6 |
| pipeline-json-stable   | candidate  |        689.8 | 683.8 | 704.1 | 672.7 |  727.5 |
| pipeline-json-param    | production |        747.0 | 740.0 | 769.2 | 732.7 |  938.0 |
| pipeline-json-param    | candidate  |        733.6 | 712.0 | 781.1 | 700.5 |  953.1 |

## Candidate / production ratios

| comparison             |   ratio | candidate advantage |
| ---------------------- | ------: | ------------------: |
| router dynamic         | 0.8363x |             35.9 ns |
| handler string stable  | 0.8323x |             36.6 ns |
| handler string param   | 0.8346x |             36.3 ns |
| handler JSON stable    | 0.8399x |             35.1 ns |
| handler JSON param     | 0.8317x |             39.6 ns |
| pipeline string stable | 0.9621x |             35.4 ns |
| pipeline string param  | 0.9840x |             15.7 ns |
| pipeline JSON stable   | 0.9200x |             60.0 ns |
| pipeline JSON param    | 0.9820x |             13.5 ns |

## Layer increments

| layer increment                              | production | candidate | candidate - production |
| -------------------------------------------- | ---------: | --------: | ---------------------: |
| handler stable string - router               |    -1.4 ns |   -2.0 ns |                -0.7 ns |
| handler param string - handler stable string |     1.2 ns |    1.5 ns |                 0.3 ns |
| handler stable JSON - router                 |    -0.5 ns |    0.4 ns |                 0.9 ns |
| handler param JSON - handler stable JSON     |    16.2 ns |   11.6 ns |                -4.5 ns |
| normalize stable string                      |   715.6 ns |  716.8 ns |                 1.2 ns |
| normalize param string                       |   764.3 ns |  784.8 ns |                20.6 ns |
| normalize stable JSON                        |   530.7 ns |  505.8 ns |               -24.9 ns |
| normalize param JSON                         |   511.8 ns |  537.9 ns |                26.1 ns |

## Router-win translation diagnostics

| boundary               | candidate advantage | retained vs router win |
| ---------------------- | ------------------: | ---------------------: |
| handler-string-stable  |             36.6 ns |                1.0186x |
| handler-string-param   |             36.3 ns |                1.0100x |
| handler-json-stable    |             35.1 ns |                0.9760x |
| handler-json-param     |             39.6 ns |                1.1021x |
| pipeline-string-stable |             35.4 ns |                0.9862x |
| pipeline-string-param  |             15.7 ns |                0.4376x |
| pipeline-json-stable   |             60.0 ns |                1.6687x |
| pipeline-json-param    |             13.5 ns |                0.3751x |

## Interpretation

1. The single-index fingerprint candidate's routing advantage is real and survives the router-to-handler boundary. The candidate keeps roughly `35–40 ns` of advantage through all handler cells.
2. A stable direct-string response preserves essentially the entire router win: `35.4 ns` remains at the string pipeline boundary versus `35.9 ns` at router match.
3. Returning the captured request-derived parameter as the string body loses about `20 ns` of the candidate advantage during response normalization. The handler itself is not the source of that loss.
4. JSON shows the same provenance sensitivity. Stable JSON gives the candidate an additional normalization benefit, while parameter-derived JSON loses about `26 ns` relative to that favorable normalization behavior.
5. Source comparison supplies a concrete hypothesis: production creates and hashes a prefix substring before slicing the trailing parameter, whereas the fingerprint candidate removes that prefix substring. The old prefix lookup may incidentally force a more response-friendly materialization of the request-derived string. This is a hypothesis, not yet a proven mechanism.
6. The next phase should isolate response construction and request-derived string representation directly. It should not redesign the handler/context API or discard the fingerprint router.
7. CP3-T is decomposition-only; no performance acceptance threshold was applied.

## Classification

**CP3-T LOCAL PIPELINE TRANSLATION DECOMPOSITION: VALID / AUTHORITATIVE / ACCEPTED AS DECOMPOSITION EVIDENCE.**

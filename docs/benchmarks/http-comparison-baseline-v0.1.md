# Gelis HTTP Comparison Baseline v0.1

**Status:** Mixed-route local baseline accepted  
**Date:** 2026-08-31

## Environment

- Bun: 1.4.0
- oha: 1.16.0
- Hono: 4.13.5
- Elysia: 1.4.30
- CPU: Intel Core i5-10500H @ 2.50GHz
- Routes: 5,000
- Connections: 50
- Samples: 7
- Workload: mixed-all URLs spanning the route table
- Success rate: 100%

Elysia was measured in default and `precompile: true` modes.

## Accepted mixed-route results

| Framework         | Case         | req/s median |    CV | p50 ms | p95 ms | p99 ms |
| ----------------- | ------------ | -----------: | ----: | -----: | -----: | -----: |
| Gelis             | static-raw   |       11,771 | 2.69% |  3.875 |  7.188 |  9.551 |
| Hono              | static-raw   |       11,580 | 8.77% |  3.882 |  7.457 |  9.875 |
| Elysia            | static-raw   |        7,640 | 1.73% |  5.899 | 10.565 | 15.301 |
| Elysia precompile | static-raw   |        7,856 | 3.05% |  5.789 | 10.091 | 12.619 |
| Gelis             | dynamic-raw  |       11,748 | 2.31% |  3.921 |  6.990 |  9.455 |
| Hono              | dynamic-raw  |        8,006 | 1.83% |  5.866 | 10.058 | 12.126 |
| Elysia            | dynamic-raw  |        7,248 | 1.76% |  6.255 | 10.708 | 14.138 |
| Elysia precompile | dynamic-raw  |        7,145 | 5.91% |  6.237 | 10.966 | 14.398 |
| Gelis             | static-json  |       11,873 | 2.33% |  3.895 |  6.890 |  9.351 |
| Hono              | static-json  |       11,354 | 2.28% |  4.060 |  7.397 |  9.604 |
| Elysia            | static-json  |        7,707 | 3.03% |  5.917 | 10.100 | 13.825 |
| Elysia precompile | static-json  |        7,768 | 7.59% |  5.871 | 10.015 | 12.548 |
| Gelis             | dynamic-json |       11,849 | 3.14% |  3.823 |  7.063 |  9.449 |
| Hono              | dynamic-json |        8,071 | 1.86% |  5.802 | 10.017 | 12.172 |
| Elysia            | dynamic-json |        7,508 | 2.53% |  6.039 | 10.314 | 13.738 |
| Elysia precompile | dynamic-json |        7,603 | 1.68% |  5.994 | 10.184 | 12.726 |

## Relative throughput vs Hono

- static raw: +1.6%;
- dynamic raw: +46.7%;
- static JSON: +4.6%;
- dynamic JSON: +46.8%.

Static raw should be treated as effectively tied.

The dynamic result is stronger evidence because both Gelis and Hono had low CV while the throughput difference persisted across mixed route selection.

## Plain-route regression after validation

A later same-machine run after validation support remained healthy:

```text
Gelis static raw     16,349 req/s
Hono  static raw     16,325 req/s

Gelis dynamic raw    15,959 req/s
Hono  dynamic raw    11,041 req/s

Gelis static JSON    16,105 req/s
Hono  static JSON    15,355 req/s

Gelis dynamic JSON   15,913 req/s
Hono  dynamic JSON   10,769 req/s
```

Absolute localhost throughput changes across runs, so comparisons should emphasize same-run medians, variance, and latency rather than mixing absolute values between runs.

## Bun adapter overhead

Compared with direct `Bun.serve({ fetch: app.fetch.bind(app) })`, nine-sample median throughput delta was:

```text
static raw      +1.37%
dynamic raw     +0.53%
static JSON     +0.35%
dynamic JSON    -0.75%
```

This is treated as negligible benchmark noise.

## Supported statement

> On the tested Windows machine with Bun 1.4.0 and 5,000 mixed routes, Gelis is approximately on par with Hono 4.13.5 for static routing and showed substantially higher throughput for the tested dynamic-routing workload. Gelis also outperformed Elysia 1.4.30 in the tested plain-route workloads.

## Not proven

This does not prove Gelis is universally faster.

Before broad public claims:

- repeat on Linux;
- repeat on a second machine;
- retain route-count and concurrency sweeps;
- compare equivalent semantics;
- report versions, variance, latency, and methodology.

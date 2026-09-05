import { cpus } from "node:os";

import { Gelis } from "../../src/index.ts";

import { RouteBuilder } from "../../src/route-builder.ts";

import { Router } from "../../src/runtime/router.ts";

import type {
  RuntimeRouteRecord,
  RuntimeRouteHandler,
} from "../../src/runtime/types.ts";

const ROUTES = 5000;

const SAMPLES = 7;

const KINDS = ["static", "dynamic"] as const;

type RouteKind = (typeof KINDS)[number];

type Scenario =
  | "builder-only"
  | "router-prebuilt"
  | "builder-router"
  | "full-app";

interface Row {
  readonly kind: RouteKind;

  readonly scenario: Scenario;

  readonly milliseconds: number;

  readonly routesPerMs: number;
}

const RESPONSE = new Response(null, {
  status: 204,
});

const HANDLER: RuntimeRouteHandler = () => RESPONSE;

let sink: unknown;

const rows: Row[] = [];

for (const kind of KINDS) {
  const paths = makePaths(kind);

  const prebuilt = paths.map(makeRuntimeRoute);

  rows.push(
    benchmark(kind, "builder-only", () => {
      const routes: RuntimeRouteRecord[] = [];

      const builder = new RouteBuilder(
        "",

        (route) => {
          routes.push(route);
        },
      );

      const get = builder.get.bind(builder) as (
        path: string,

        handler: RuntimeRouteHandler,
      ) => unknown;

      for (const path of paths) {
        get(path, HANDLER);
      }

      sink = routes;
    }),
  );

  rows.push(
    benchmark(kind, "router-prebuilt", () => {
      const router = new Router();

      for (const route of prebuilt) {
        router.register(route);
      }

      sink = router;
    }),
  );

  rows.push(
    benchmark(kind, "builder-router", () => {
      const router = new Router();

      const routes: RuntimeRouteRecord[] = [];

      const builder = new RouteBuilder(
        "",

        (route) => {
          router.register(route);

          routes.push(route);
        },
      );

      const get = builder.get.bind(builder) as (
        path: string,

        handler: RuntimeRouteHandler,
      ) => unknown;

      for (const path of paths) {
        get(path, HANDLER);
      }

      sink = {
        router,
        routes,
      };
    }),
  );

  rows.push(
    benchmark(kind, "full-app", () => {
      const app = new Gelis();

      const get = app.get.bind(app) as (
        path: string,

        handler: RuntimeRouteHandler,
      ) => unknown;

      for (const path of paths) {
        get(path, HANDLER);
      }

      sink = app;
    }),
  );
}

console.log("\nGelis P6-C registration decomposition");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Routes:  ${ROUTES}`);

console.log(`Samples: ${SAMPLES}\n`);

console.table(
  rows.map((row) => ({
    kind: row.kind,

    scenario: row.scenario,

    "median ms": round(row.milliseconds, 3),

    "routes/ms": Math.round(row.routesPerMs),
  })),
);

function benchmark(
  kind: RouteKind,

  scenario: Scenario,

  operation: () => void,
): Row {
  /*
   * Warm JIT separately.
   *
   * We care about registration-layer
   * decomposition here, not process startup.
   */
  operation();

  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const start = performance.now();

    operation();

    samples.push(performance.now() - start);
  }

  const milliseconds = median(samples);

  return {
    kind,

    scenario,

    milliseconds,

    routesPerMs: ROUTES / milliseconds,
  };
}

function makePaths(kind: RouteKind): string[] {
  const paths = new Array<string>(ROUTES);

  for (let index = 0; index < ROUTES; index++) {
    paths[index] = kind === "static" ? `/r/${index}` : `/r/${index}/:id`;
  }

  return paths;
}

function makeRuntimeRoute(path: string): RuntimeRouteRecord {
  return {
    method: "GET",

    path,

    handler: HANDLER,

    flags: 0,

    input: undefined,

    beforeHandle: undefined,

    afterHandle: undefined,

    responses: undefined,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  const value = sorted[Math.floor(sorted.length / 2)];

  if (value === undefined) {
    throw new Error("Empty median");
  }

  return value;
}

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

void sink;

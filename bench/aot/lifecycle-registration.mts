import { cpus } from "node:os";

import { RouteBuilder } from "../../src/route-builder.ts";

import { Router } from "../../src/runtime/router.ts";

import {
  compileAfterHandle,
  compileBeforeHandle,
} from "../../src/runtime/lifecycle.ts";

import type {
  RuntimeAfterHandle,
  RuntimeBeforeHandle,
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "../../src/runtime/types.ts";

const ROUTES = 5000;

const SAMPLES = 9;

const KINDS = ["static", "dynamic"] as const;

type RouteKind = (typeof KINDS)[number];

type Scenario = "builder-router" | "app-like-current" | "app-like-fast-empty";

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

const EMPTY_BEFORE: RuntimeBeforeHandle[] = [];

const EMPTY_AFTER: RuntimeAfterHandle[] = [];

let sink: unknown;

const rows: Row[] = [];

for (const kind of KINDS) {
  const paths = makePaths(kind);

  rows.push(
    benchmark(
      kind,

      "builder-router",

      () => {
        const router = new Router();

        const entries: RuntimeRouteRecord[] = [];

        const builder = createBuilder((route) => {
          router.register(route);

          entries.push(route);
        });

        registerPaths(builder, paths);

        sink = {
          router,
          entries,
        };
      },
    ),
  );

  rows.push(
    benchmark(
      kind,

      "app-like-current",

      () => {
        const router = new Router();

        const entries: AppLikeEntry[] = [];

        const builder = createBuilder((route) => {
          const entry: AppLikeEntry = {
            route,

            localBeforeHandle: route.beforeHandle,

            localAfterHandle: route.afterHandle,
          };

          const beforeHandle = compileBeforeHandle(
            EMPTY_BEFORE,

            entry.localBeforeHandle,
          );

          const afterHandle = compileAfterHandle(
            EMPTY_AFTER,

            entry.localAfterHandle,
          );

          route.beforeHandle = beforeHandle;

          route.afterHandle = afterHandle;

          route.flags = 0;

          router.register(route);

          entries.push(entry);
        });

        registerPaths(builder, paths);

        sink = {
          router,
          entries,
        };
      },
    ),
  );

  rows.push(
    benchmark(
      kind,

      "app-like-fast-empty",

      () => {
        const router = new Router();

        const entries: AppLikeEntry[] = [];

        const builder = createBuilder((route) => {
          const entry: AppLikeEntry = {
            route,

            localBeforeHandle: route.beforeHandle,

            localAfterHandle: route.afterHandle,
          };

          /*
           * Candidate zero-lifecycle fast path.
           *
           * For this fixture there are:
           * - no global hooks
           * - no local hooks
           *
           * Therefore lifecycle compilation
           * semantically resolves to undefined.
           */
          route.beforeHandle = undefined;

          route.afterHandle = undefined;

          route.flags = 0;

          router.register(route);

          entries.push(entry);
        });

        registerPaths(builder, paths);

        sink = {
          router,
          entries,
        };
      },
    ),
  );
}

console.log("\nGelis P6-C2 lifecycle registration decomposition");

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

interface AppLikeEntry {
  readonly route: RuntimeRouteRecord;

  readonly localBeforeHandle: RuntimeBeforeHandle | undefined;

  readonly localAfterHandle: RuntimeAfterHandle | undefined;
}

function createBuilder(register: (route: RuntimeRouteRecord) => void): {
  get(
    path: string,

    handler: RuntimeRouteHandler,
  ): unknown;
} {
  const builder = new RouteBuilder(
    "",

    register,
  );

  return {
    get: builder.get.bind(builder) as (
      path: string,

      handler: RuntimeRouteHandler,
    ) => unknown,
  };
}

function registerPaths(
  builder: {
    get(
      path: string,

      handler: RuntimeRouteHandler,
    ): unknown;
  },

  paths: readonly string[],
): void {
  for (const path of paths) {
    builder.get(
      path,

      HANDLER,
    );
  }
}

function benchmark(
  kind: RouteKind,

  scenario: Scenario,

  operation: () => void,
): Row {
  /*
   * Warm each execution shape independently.
   */
  operation();

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

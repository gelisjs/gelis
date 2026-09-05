import { gzipSync } from "node:zlib";

import type { FlatAotArtifact } from "../../src/runtime/flat-aot-artifact.ts";

import type {
  DynamicNodeSnapshot,
  MethodRoutesSnapshot,
} from "../../src/runtime/router-snapshot.ts";

import { compileFlatAotArtifact } from "../../src/tooling/flat-aot-artifact-compiler.ts";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler.ts";

const ROUTES = 5000;

const SHAPES = ["static", "trailing", "shared", "unique", "multi"] as const;

type Shape = (typeof SHAPES)[number];

type CompactHybridNode = readonly [
  staticChildren:
    | 0
    | readonly (readonly [segment: string, child: CompactHybridNode])[],

  paramChild: 0 | CompactHybridNode,

  routeIndex: -1 | number,

  paramNames: 0 | readonly string[],
];

type CompactHybridMethod = readonly [
  methodId: number,

  staticPaths: readonly string[],

  staticRouteIndexes: readonly number[],

  trailingPrefixes: 0 | readonly string[],

  trailingRouteIndexes: 0 | readonly number[],

  trailingParamNames: 0 | readonly string[],

  dynamicRoot: 0 | CompactHybridNode,

  usesDynamicTrie: 0 | 1,
];

type CompactHybridArtifact = readonly [
  version: 1,

  routeCount: number,

  shapeFingerprint: string,

  methodNames: readonly string[],

  routeMethodIds: readonly number[],

  routePaths: readonly string[],

  methods: readonly CompactHybridMethod[],
];

interface Row {
  readonly shape: Shape;

  readonly flatBytes: number;

  readonly hybridBytes: number;

  readonly flatRouterBytes: number;

  readonly hybridRouterBytes: number;

  readonly flatGzipBytes: number;

  readonly hybridGzipBytes: number;
}

const rows: Row[] = [];

for (const shape of SHAPES) {
  const routeShapes = createRouteShapes(shape);

  const plan = await compileSemanticRoutePlan(routeShapes);

  const flat = compileFlatAotArtifact(plan);

  const hybrid = compileCompactHybridArtifact(flat, plan.router.methods);

  const flatJson = JSON.stringify(flat);

  const hybridJson = JSON.stringify(hybrid);

  const flatRouterJson = JSON.stringify(flat[6]);

  const hybridRouterJson = JSON.stringify(hybrid[6]);

  rows.push({
    shape,

    flatBytes: byteLength(flatJson),

    hybridBytes: byteLength(hybridJson),

    flatRouterBytes: byteLength(flatRouterJson),

    hybridRouterBytes: byteLength(hybridRouterJson),

    flatGzipBytes: gzipSync(flatJson).byteLength,

    hybridGzipBytes: gzipSync(hybridJson).byteLength,
  });
}

console.log("\nGelis P6-E6-E3D.4B hybrid topology payload tradeoff");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`Routes:  ${ROUTES}`);

console.log("Serialization: compact JSON\n");

console.table(
  rows.map((row) => ({
    shape: row.shape,

    "flat bytes": row.flatBytes,

    "hybrid bytes": row.hybridBytes,

    "full delta": formatRatio(row.hybridBytes / row.flatBytes),

    "flat router": row.flatRouterBytes,

    "hybrid router": row.hybridRouterBytes,

    "router delta": formatRatio(row.hybridRouterBytes / row.flatRouterBytes),

    "flat gzip": row.flatGzipBytes,

    "hybrid gzip": row.hybridGzipBytes,

    "gzip delta": formatRatio(row.hybridGzipBytes / row.flatGzipBytes),
  })),
);

const genericRows = rows.filter(
  (row) =>
    row.shape === "shared" || row.shape === "unique" || row.shape === "multi",
);

const fullGeo = geometricMean(
  genericRows.map((row) => row.hybridBytes / row.flatBytes),
);

const routerGeo = geometricMean(
  genericRows.map((row) => row.hybridRouterBytes / row.flatRouterBytes),
);

const gzipGeo = geometricMean(
  genericRows.map((row) => row.hybridGzipBytes / row.flatGzipBytes),
);

console.log("\nGeneric geomean");

console.log(`full   ${formatRatio(fullGeo)}`);

console.log(`router ${formatRatio(routerGeo)}`);

console.log(`gzip   ${formatRatio(gzipGeo)}`);

console.log(`\nDecision: ${classify(genericRows, fullGeo, routerGeo)}`);

function compileCompactHybridArtifact(
  flat: FlatAotArtifact,

  routerMethods: readonly (readonly [string, MethodRoutesSnapshot])[],
): CompactHybridArtifact {
  const [
    ,
    routeCount,
    shapeFingerprint,
    methodNames,
    routeMethodIds,
    routePaths,
    flatRouter,
  ] = flat;

  const [flatMethods] = flatRouter;

  if (flatMethods.length !== routerMethods.length) {
    throw new Error("Gelis hybrid payload method count mismatch");
  }

  const methods = new Array<CompactHybridMethod>(flatMethods.length);

  for (let index = 0; index < flatMethods.length; index++) {
    const flatMethod = flatMethods[index];

    const snapshotEntry = routerMethods[index];

    if (flatMethod === undefined || snapshotEntry === undefined) {
      throw new Error(`Missing Gelis hybrid payload method: ${index}`);
    }

    const [, snapshot] = snapshotEntry;

    const [
      methodId,
      staticPaths,
      staticRouteIndexes,
      trailingPrefixes,
      trailingRouteIndexes,
      trailingParamNames,
      ,
      usesDynamicTrie,
    ] = flatMethod;

    methods[index] = [
      methodId,

      staticPaths,

      staticRouteIndexes,

      trailingPrefixes,

      trailingRouteIndexes,

      trailingParamNames,

      usesDynamicTrie === 1 ? compactNode(snapshot.dynamicRoot) : 0,

      usesDynamicTrie,
    ];
  }

  return [
    1,

    routeCount,

    shapeFingerprint,

    methodNames,

    routeMethodIds,

    routePaths,

    methods,
  ];
}

function compactNode(node: DynamicNodeSnapshot): CompactHybridNode {
  let staticChildren: CompactHybridNode[0] = 0;

  if (node.staticChildren !== undefined) {
    const children = new Array<readonly [string, CompactHybridNode]>(
      node.staticChildren.length,
    );

    for (let index = 0; index < node.staticChildren.length; index++) {
      const child = node.staticChildren[index];

      if (child === undefined) {
        throw new Error(`Missing Gelis hybrid payload child: ${index}`);
      }

      children[index] = [child[0], compactNode(child[1])];
    }

    staticChildren = children;
  }

  const route = node.route;

  return [
    staticChildren,

    node.paramChild === undefined ? 0 : compactNode(node.paramChild),

    route === undefined ? -1 : route.routeIndex,

    route === undefined ? 0 : route.paramNames,
  ];
}

function createRouteShapes(shape: Shape): readonly {
  readonly method: "GET";

  readonly path: string;
}[] {
  const routes = new Array<{
    method: "GET";

    path: string;
  }>(ROUTES);

  for (let index = 0; index < ROUTES; index++) {
    let path: string;

    switch (shape) {
      case "static":
        path = `/r/${index}/detail`;

        break;

      case "trailing":
        path = `/r/${index}/:id`;

        break;

      case "shared":
        path = `/r/${index}/:id/detail`;

        break;

      case "unique":
        path = `/r/${index}/:p${index}/detail`;

        break;

      case "multi":
        path = `/r/${index}/:team/users/:id/detail`;

        break;
    }

    routes[index] = {
      method: "GET",

      path,
    };
  }

  return routes;
}

function classify(
  genericRows: readonly Row[],

  fullGeo: number,

  routerGeo: number,
): "STRONG SIGNAL" | "ADVANCE" | "BORDERLINE" | "STOP" {
  const maxFull = Math.max(
    ...genericRows.map((row) => row.hybridBytes / row.flatBytes),
  );

  if (fullGeo <= 1.1 && routerGeo <= 1.2 && maxFull <= 1.15) {
    return "STRONG SIGNAL";
  }

  if (fullGeo <= 1.2 && routerGeo <= 1.35 && maxFull <= 1.25) {
    return "ADVANCE";
  }

  if (fullGeo > 1.3 || routerGeo > 1.5 || maxFull > 1.35) {
    return "STOP";
  }

  return "BORDERLINE";
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function geometricMean(values: readonly number[]): number {
  return Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) / values.length,
  );
}

function formatRatio(ratio: number): string {
  const percent = (ratio - 1) * 100;

  const rounded = Math.round(percent * 100) / 100;

  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

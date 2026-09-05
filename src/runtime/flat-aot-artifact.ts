export const FLAT_AOT_ARTIFACT_VERSION = 1 as const;

export type FlatAotArtifact = readonly [
  version: typeof FLAT_AOT_ARTIFACT_VERSION,

  routeCount: number,

  shapeFingerprint: string,

  methodNames: readonly string[],

  routeMethodIds: readonly number[],

  routePaths: readonly string[],

  router: FlatAotRouter,
];

export type FlatAotRouter = readonly [
  methods: readonly FlatAotMethod[],

  nodeStaticStart: readonly number[],

  nodeStaticCount: readonly number[],

  nodeParamChild: readonly number[],

  nodeRouteIndex: readonly number[],

  nodeParamStart: readonly number[],

  nodeParamCount: readonly number[],

  edgeSegments: readonly string[],

  edgeChildren: readonly number[],

  paramNames: readonly string[],
];

export type FlatAotMethod = readonly [
  methodId: number,

  staticPaths: readonly string[],

  staticRouteIndexes: readonly number[],

  trailingPrefixes: 0 | readonly string[],

  trailingRouteIndexes: 0 | readonly number[],

  trailingParamNames: 0 | readonly string[],

  rootNode: number,

  usesDynamicTrie: 0 | 1,
];

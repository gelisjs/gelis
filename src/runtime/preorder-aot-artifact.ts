export const PREORDER_AOT_ARTIFACT_VERSION = 1 as const;

export type PreorderAotArtifact = readonly [
  version: typeof PREORDER_AOT_ARTIFACT_VERSION,

  routeCount: number,

  shapeFingerprint: string,

  methodNames: readonly string[],

  routeMethodIds: readonly number[],

  routePaths: readonly string[],

  router: PreorderAotRouter,
];

export type PreorderAotRouter = readonly [
  methods: readonly PreorderAotMethod[],

  nodeStaticCount: readonly number[],

  nodeHasParamChild: readonly number[],

  nodeRouteIndex: readonly number[],

  nodeParamCount: readonly number[],

  edgeSegments: readonly string[],

  paramNames: readonly string[],
];

export type PreorderAotMethod = readonly [
  methodId: number,

  staticPaths: readonly string[],

  staticRouteIndexes: readonly number[],

  trailingPrefixes: 0 | readonly string[],

  trailingRouteIndexes: 0 | readonly number[],

  trailingParamNames: 0 | readonly string[],

  nodeStart: number,

  nodeCount: number,

  edgeStart: number,

  edgeCount: number,

  paramStart: number,

  paramEntryCount: number,

  usesDynamicTrie: 0 | 1,
];

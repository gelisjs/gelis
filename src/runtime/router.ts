import { ALL_ROUTE_METHOD } from "../http-method";
import { pathnameFromRequestUrl } from "./url";

import type { RuntimeRouteRecord } from "./types";

export interface DynamicRoute {
  readonly route: RuntimeRouteRecord;

  readonly paramNames: readonly string[];
}

export interface DynamicNode {
  staticChildren: Map<string, DynamicNode> | undefined;

  paramChild: DynamicNode | undefined;

  route: DynamicRoute | undefined;
}

export interface TrailingParamRoute {
  readonly route: RuntimeRouteRecord;

  readonly paramName: string;
}

interface TrailingFingerprintUniqueEntry {
  readonly kind: "unique";

  readonly prefix: string;

  readonly trailingRoute: TrailingParamRoute;
}

interface TrailingCollisionRoute {
  readonly route: RuntimeRouteRecord;

  readonly prefix: string;
}

type TrailingSecondaryFingerprintEntry =
  TrailingCollisionRoute | Map<string, TrailingCollisionRoute>;

interface TrailingFingerprintCollisionEntry {
  readonly kind: "collision";

  /*
   * Legacy/AOT/prebuilt collision buckets may still carry the exact prefix
   * map. Runtime-created collision buckets use `secondary` instead, so the
   * optimized representation does not retain two full indexes for the same
   * routes.
   */
  readonly routes?: Map<string, TrailingParamRoute>;

  readonly secondary?: Map<number, TrailingSecondaryFingerprintEntry>;

  /*
   * Runtime collision buckets retain one shared parameter name when every
   * route in the bucket uses the same trailing parameter. Mixed-name buckets
   * clear this value and fall back to route-local derivation on match.
   */
  paramName?: string;
}

type TrailingFingerprintEntry =
  TrailingFingerprintUniqueEntry | TrailingFingerprintCollisionEntry;

type FastMapKind = 0 | 1 | 2;

const FAST_MAP_STATIC_ONLY: FastMapKind = 0;
const FAST_MAP_TRAILING_ONLY: FastMapKind = 1;
const FAST_MAP_MIXED: FastMapKind = 2;

export interface MethodRoutes {
  readonly staticRoutes: Map<string, RuntimeRouteRecord>;

  fastMapKind?: FastMapKind;

  staticPathLengthMin?: number;

  staticPathLeadMask?: number;

  staticPathLengthMax?: number;

  trailingParamRoutes: Map<string, TrailingParamRoute> | undefined;

  trailingParamFingerprints?: Map<number, TrailingFingerprintEntry>;

  readonly dynamicRoot: DynamicNode;

  usesDynamicTrie: boolean;
}

export interface RuntimeRouteMatch {
  readonly route: RuntimeRouteRecord;

  readonly params: Record<string, string>;
}

const EMPTY_PARAMS = Object.freeze({}) as Record<string, string>;

export class Router {
  #methods = new Map<string, MethodRoutes>();

  constructor() {
    Object.defineProperty(this, "matchRequestUrl", {
      configurable: true,
      writable: true,
      value: undefined,
    });
  }

  static fromMethods(methods: Map<string, MethodRoutes>): Router {
    const router = new Router();

    router.#methods = methods;

    if (methodsNeedRequestUrlMatching(methods)) {
      router.#activateRequestUrlMatching();
    }

    return router;
  }

  register(route: RuntimeRouteRecord): void {
    const table = this.getOrCreateMethod(route.method);

    if (
      registerRouteIntoTable(table, route) ||
      route.method === ALL_ROUTE_METHOD
    ) {
      this.#activateRequestUrlMatching();
    }
  }

  /*
   * Registers one composition batch transactionally.
   *
   * Only HTTP method tables touched by the batch are
   * copied. The active router is replaced only after
   * every route has registered successfully.
   *
   * Duplicate detection therefore uses Router's
   * canonical topology directly instead of a second
   * string-normalization pass.
   */
  registerBatchAtomic(routes: readonly RuntimeRouteRecord[]): void {
    if (routes.length === 0) {
      return;
    }

    const nextMethods = new Map(this.#methods);

    const writableMethods = new Map<string, MethodRoutes>();
    let needsRequestUrlMatching = false;

    for (const route of routes) {
      let table = writableMethods.get(route.method);

      if (table === undefined) {
        const existing = nextMethods.get(route.method);

        table =
          existing === undefined
            ? createMethodRoutes()
            : cloneMethodRoutes(existing);

        writableMethods.set(route.method, table);

        nextMethods.set(route.method, table);
      }

      needsRequestUrlMatching =
        registerRouteIntoTable(table, route) ||
        route.method === ALL_ROUTE_METHOD ||
        needsRequestUrlMatching;
    }

    /*
     * No mutation of the active method map occurred
     * before this point.
     */
    this.#methods = nextMethods;

    if (needsRequestUrlMatching) {
      this.#activateRequestUrlMatching();
    }
  }

  match(method: string, pathname: string): RuntimeRouteMatch | undefined {
    const table = this.#methods.get(method);

    if (!table) {
      return undefined;
    }

    /*
     * Static always has highest precedence.
     */
    const staticRoute = table.staticRoutes.get(pathname);

    if (staticRoute) {
      return {
        route: staticRoute,

        params: EMPTY_PARAMS,
      };
    }

    /*
     * Fast-map mode.
     *
     * This mode exists only when the method has
     * no generic dynamic routes.
     *
     * Therefore a miss can immediately return
     * undefined instead of falling through to
     * the generic trie.
     */
    if (!table.usesDynamicTrie) {
      const trailingParamFingerprints = table.trailingParamFingerprints;

      const trailingParamRoutes = table.trailingParamRoutes;

      if (
        pathname !== "/" &&
        (trailingParamFingerprints !== undefined ||
          trailingParamRoutes !== undefined)
      ) {
        const slash = pathname.lastIndexOf("/");

        if (slash >= 0) {
          const prefixEnd = slash + 1;

          let trailingRoute:
            TrailingParamRoute | TrailingCollisionRoute | undefined;
          let collisionParamName: string | undefined;

          if (trailingParamFingerprints !== undefined) {
            const entry = trailingParamFingerprints.get(
              prefixFingerprint(pathname, prefixEnd),
            );

            if (entry?.kind === "unique") {
              if (
                entry.prefix.length === prefixEnd &&
                pathname.startsWith(entry.prefix)
              ) {
                trailingRoute = entry.trailingRoute;
              }
            } else if (entry !== undefined) {
              const secondary = entry.secondary;

              if (secondary === undefined) {
                trailingRoute = entry.routes?.get(pathname.slice(0, prefixEnd));
              } else {
                collisionParamName = entry.paramName;

                const secondaryEntry = secondary.get(
                  secondaryPrefixFingerprint(pathname, prefixEnd),
                );

                if (secondaryEntry instanceof Map) {
                  trailingRoute = secondaryEntry.get(
                    pathname.slice(0, prefixEnd),
                  );
                } else if (
                  secondaryEntry !== undefined &&
                  secondaryEntry.prefix.length === prefixEnd &&
                  pathname.startsWith(secondaryEntry.prefix)
                ) {
                  trailingRoute = secondaryEntry;
                }
              }
            }
          } else if (trailingParamRoutes !== undefined) {
            trailingRoute = trailingParamRoutes.get(
              pathname.slice(0, prefixEnd),
            );
          }

          if (trailingRoute) {
            const value = pathname.slice(prefixEnd);
            const paramName =
              collisionParamName ?? trailingRouteParamName(trailingRoute);

            return {
              route: trailingRoute.route,

              params: {
                [paramName]: decodeParam(value),
              },
            };
          }
        }
      }

      return undefined;
    }

    /*
     * Generic mode.
     *
     * There is deliberately no fast-map lookup
     * here. This is effectively the original
     * dynamic router path.
     */
    const captures: number[] = [];

    const dynamicRoute = matchDynamicPath(
      table.dynamicRoot,

      pathname,

      captures,
    );

    if (!dynamicRoute) {
      return undefined;
    }

    const params: Record<string, string> = {};

    for (let index = 0; index < dynamicRoute.paramNames.length; index++) {
      const name = dynamicRoute.paramNames[index];

      const start = captures[index * 2];

      const end = captures[index * 2 + 1];

      if (name === undefined || start === undefined || end === undefined) {
        continue;
      }

      const value = pathname.slice(start, end);

      params[name] = decodeParam(value);
    }

    return {
      route: dynamicRoute.route,

      params,
    };
  }

  #activateRequestUrlMatching(): void {
    const capability = this as unknown as {
      matchRequestUrl?: Router["matchRequestUrl"];
    };

    if (
      Object.prototype.hasOwnProperty.call(this, "matchRequestUrl") &&
      capability.matchRequestUrl === undefined
    ) {
      delete capability.matchRequestUrl;
    }
  }

  matchRequestUrl(method: string, url: string): RuntimeRouteMatch | undefined {
    const table = this.#methods.get(method);

    if (!table) {
      return undefined;
    }

    let authorityStart: number;

    if (
      url.charCodeAt(0) !== 104 ||
      url.charCodeAt(1) !== 116 ||
      url.charCodeAt(2) !== 116 ||
      url.charCodeAt(3) !== 112
    ) {
      return this.match(method, pathnameFromRequestUrl(url));
    }

    if (
      url.charCodeAt(4) === 58 &&
      url.charCodeAt(5) === 47 &&
      url.charCodeAt(6) === 47
    ) {
      authorityStart = 7;
    } else if (
      url.charCodeAt(4) === 115 &&
      url.charCodeAt(5) === 58 &&
      url.charCodeAt(6) === 47 &&
      url.charCodeAt(7) === 47
    ) {
      authorityStart = 8;
    } else {
      return this.match(method, pathnameFromRequestUrl(url));
    }

    const pathStart = url.indexOf("/", authorityStart);

    if (pathStart === -1) {
      return this.match(method, "/");
    }

    const queryStart = url.indexOf("?", pathStart + 1);
    const pathEnd = queryStart === -1 ? url.length : queryStart;
    let pathname: string | undefined;

    /*
     * Runtime-created tables carry a conservative bitmask derived from the
     * first UTF-16 code unit after the leading slash of each static path. A
     * missing bit proves that no exact static route can match this request,
     * so dynamic requests may skip substring allocation + Map lookup. When
     * the bit is present, perform the canonical exact lookup directly without
     * paying the upper-bound discriminator on the static-hit path.
     *
     * Legacy/AOT/prebuilt tables without this metadata retain CP4-AI's
     * conservative static-length upper-bound behavior. Bit collisions are
     * harmless false positives and only cause the canonical lookup.
     */
    if (table.staticRoutes.size !== 0) {
      const staticPathLeadMask = table.staticPathLeadMask;
      let mayMatchStatic: boolean;

      if (staticPathLeadMask === undefined) {
        const staticPathLengthMax = table.staticPathLengthMax;
        mayMatchStatic =
          staticPathLengthMax === undefined ||
          pathEnd - pathStart <= staticPathLengthMax;
      } else {
        const leadBit = 1 << (url.charCodeAt(pathStart + 1) & 31);
        mayMatchStatic = (staticPathLeadMask & leadBit) !== 0;
      }

      if (mayMatchStatic) {
        pathname = url.slice(pathStart, pathEnd);

        const staticRoute = table.staticRoutes.get(pathname);

        if (staticRoute) {
          return {
            route: staticRoute,
            params: EMPTY_PARAMS,
          };
        }
      }
    }

    const trailingParamFingerprints = table.trailingParamFingerprints;
    const trailingParamRoutes = table.trailingParamRoutes;

    if (!table.usesDynamicTrie) {
      if (
        pathEnd - pathStart > 1 &&
        (trailingParamFingerprints !== undefined ||
          trailingParamRoutes !== undefined)
      ) {
        const slash = url.lastIndexOf("/", pathEnd - 1);

        if (slash >= pathStart) {
          const prefixEnd = slash + 1;
          const prefixLength = prefixEnd - pathStart;

          let trailingRoute:
            TrailingParamRoute | TrailingCollisionRoute | undefined;
          let collisionParamName: string | undefined;

          if (trailingParamFingerprints !== undefined) {
            const entry = trailingParamFingerprints.get(
              prefixFingerprintRange(url, prefixEnd, prefixLength),
            );

            if (entry?.kind === "unique") {
              if (
                entry.prefix.length === prefixLength &&
                url.startsWith(entry.prefix, pathStart)
              ) {
                trailingRoute = entry.trailingRoute;
              }
            } else if (entry !== undefined) {
              const secondary = entry.secondary;

              if (secondary === undefined) {
                trailingRoute = entry.routes?.get(
                  url.slice(pathStart, prefixEnd),
                );
              } else {
                collisionParamName = entry.paramName;

                const secondaryEntry = secondary.get(
                  secondaryPrefixFingerprintRange(url, prefixEnd, prefixLength),
                );

                if (secondaryEntry instanceof Map) {
                  trailingRoute = secondaryEntry.get(
                    url.slice(pathStart, prefixEnd),
                  );
                } else if (
                  secondaryEntry !== undefined &&
                  secondaryEntry.prefix.length === prefixLength &&
                  url.startsWith(secondaryEntry.prefix, pathStart)
                ) {
                  trailingRoute = secondaryEntry;
                }
              }
            }
          } else if (trailingParamRoutes !== undefined) {
            trailingRoute = trailingParamRoutes.get(
              url.slice(pathStart, prefixEnd),
            );
          }

          if (trailingRoute) {
            const value = url.slice(prefixEnd, pathEnd);
            const paramName =
              collisionParamName ?? trailingRouteParamName(trailingRoute);

            return {
              route: trailingRoute.route,
              params: {
                [paramName]: decodeParam(value),
              },
            };
          }
        }
      }

      return undefined;
    }

    pathname ??= url.slice(pathStart, pathEnd);

    return matchGenericDynamicTable(table, pathname);
  }

  matchRequestUrlWithAllFallback(
    method: string,
    url: string,
  ): RuntimeRouteMatch | undefined {
    /*
     * app.all() activates the only caller of this method. When the ALL table
     * is the router's sole method table, skip the guaranteed method miss and
     * dispatch directly through the canonical request-URL matcher for `*`.
     *
     * If any concrete method table exists, preserve CP4-U semantics exactly:
     * exact method first, then ALL fallback. Reading Map.size keeps the mode
     * self-updating when routes are registered later without adding state or
     * registration-time work to routers that never use app.all().
     *
     * Call through Router.prototype explicitly because app.all() shadows the
     * instance matchRequestUrl property with its fallback wrapper.
     */
    const exactMatchRequestUrl = Router.prototype.matchRequestUrl;

    if (this.#methods.size === 1) {
      return exactMatchRequestUrl.call(this, ALL_ROUTE_METHOD, url);
    }

    const exact = exactMatchRequestUrl.call(this, method, url);

    if (exact !== undefined || method === ALL_ROUTE_METHOD) {
      return exact;
    }

    return exactMatchRequestUrl.call(this, ALL_ROUTE_METHOD, url);
  }

  matchingMethods(pathname: string): string[] {
    const methods: string[] = [];

    for (const [method, table] of this.#methods) {
      if (methodTableMatchesPath(table, pathname)) {
        methods.push(method);
      }
    }

    return methods;
  }

  private getOrCreateMethod(method: string): MethodRoutes {
    const existing = this.#methods.get(method);

    if (existing) {
      return existing;
    }

    const created = createMethodRoutes();

    this.#methods.set(method, created);

    return created;
  }
}

function matchGenericDynamicTable(
  table: MethodRoutes,
  pathname: string,
): RuntimeRouteMatch | undefined {
  const captures: number[] = [];
  const dynamicRoute = matchDynamicPath(table.dynamicRoot, pathname, captures);

  if (!dynamicRoute) {
    return undefined;
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < dynamicRoute.paramNames.length; index++) {
    const name = dynamicRoute.paramNames[index];
    const start = captures[index * 2];
    const end = captures[index * 2 + 1];

    if (name === undefined || start === undefined || end === undefined) {
      continue;
    }

    params[name] = decodeParam(pathname.slice(start, end));
  }

  return {
    route: dynamicRoute.route,
    params,
  };
}

function methodTableMatchesPath(
  table: MethodRoutes,

  pathname: string,
): boolean {
  if (table.staticRoutes.has(pathname)) {
    return true;
  }

  if (!table.usesDynamicTrie) {
    const trailingParamFingerprints = table.trailingParamFingerprints;

    const trailingParamRoutes = table.trailingParamRoutes;

    if (
      pathname !== "/" &&
      (trailingParamFingerprints !== undefined ||
        trailingParamRoutes !== undefined)
    ) {
      const slash = pathname.lastIndexOf("/");

      if (slash >= 0) {
        const prefixEnd = slash + 1;

        if (trailingParamFingerprints !== undefined) {
          const entry = trailingParamFingerprints.get(
            prefixFingerprint(pathname, prefixEnd),
          );

          if (entry?.kind === "unique") {
            return (
              entry.prefix.length === prefixEnd &&
              pathname.startsWith(entry.prefix)
            );
          }

          if (entry !== undefined) {
            const secondary = entry.secondary;

            if (secondary === undefined) {
              if (entry.routes?.has(pathname.slice(0, prefixEnd))) {
                return true;
              }
            } else {
              const secondaryEntry = secondary.get(
                secondaryPrefixFingerprint(pathname, prefixEnd),
              );

              if (secondaryEntry instanceof Map) {
                if (secondaryEntry.has(pathname.slice(0, prefixEnd))) {
                  return true;
                }
              } else if (
                secondaryEntry !== undefined &&
                secondaryEntry.prefix.length === prefixEnd &&
                pathname.startsWith(secondaryEntry.prefix)
              ) {
                return true;
              }
            }
          }
        } else if (
          trailingParamRoutes !== undefined &&
          trailingParamRoutes.has(pathname.slice(0, prefixEnd))
        ) {
          return true;
        }
      }
    }

    return false;
  }

  return dynamicTableMatchesPath(
    table.dynamicRoot,

    pathname,
  );
}

function dynamicTableMatchesPath(
  root: DynamicNode,

  pathname: string,
): boolean {
  if (pathname === "/") {
    return root.route !== undefined;
  }

  return dynamicNodeMatchesPath(
    root,

    pathname,

    1,
  );
}

function dynamicNodeMatchesPath(
  node: DynamicNode,

  pathname: string,

  start: number,
): boolean {
  let end = pathname.indexOf(
    "/",

    start,
  );

  const isLast = end === -1;

  if (isLast) {
    end = pathname.length;
  }

  const next = end + 1;

  const staticChildren = node.staticChildren;

  if (staticChildren !== undefined) {
    const segment = pathname.slice(
      start,

      end,
    );

    const staticChild = staticChildren.get(segment);

    if (
      staticChild !== undefined &&
      (isLast
        ? staticChild.route !== undefined
        : dynamicNodeMatchesPath(
            staticChild,

            pathname,

            next,
          ))
    ) {
      return true;
    }
  }

  const paramChild = node.paramChild;

  if (
    paramChild !== undefined &&
    (isLast
      ? paramChild.route !== undefined
      : dynamicNodeMatchesPath(
          paramChild,

          pathname,

          next,
        ))
  ) {
    return true;
  }

  return false;
}

function methodsNeedRequestUrlMatching(
  methods: Map<string, MethodRoutes>,
): boolean {
  for (const [method, table] of methods) {
    if (
      method === ALL_ROUTE_METHOD ||
      methodTableNeedsRequestUrlMatching(table)
    ) {
      return true;
    }
  }

  return false;
}

function methodTableNeedsRequestUrlMatching(table: MethodRoutes): boolean {
  return (
    table.usesDynamicTrie ||
    (table.trailingParamFingerprints !== undefined &&
      table.trailingParamFingerprints.size !== 0) ||
    (table.trailingParamRoutes !== undefined &&
      table.trailingParamRoutes.size !== 0)
  );
}

function createMethodRoutes(): MethodRoutes {
  return {
    staticRoutes: new Map(),

    fastMapKind: FAST_MAP_STATIC_ONLY,

    staticPathLeadMask: 0,

    staticPathLengthMax: Number.NEGATIVE_INFINITY,

    trailingParamRoutes: undefined,

    dynamicRoot: createDynamicNode(),

    usesDynamicTrie: false,
  };
}

function cloneMethodRoutes(table: MethodRoutes): MethodRoutes {
  return {
    staticRoutes: new Map(table.staticRoutes),

    ...(table.fastMapKind === undefined
      ? {}
      : { fastMapKind: table.fastMapKind }),

    ...(table.staticPathLengthMin === undefined
      ? {}
      : { staticPathLengthMin: table.staticPathLengthMin }),

    ...(table.staticPathLeadMask === undefined
      ? {}
      : { staticPathLeadMask: table.staticPathLeadMask }),

    ...(table.staticPathLengthMax === undefined
      ? {}
      : { staticPathLengthMax: table.staticPathLengthMax }),

    trailingParamRoutes:
      table.trailingParamRoutes === undefined
        ? undefined
        : new Map(table.trailingParamRoutes),

    ...(table.trailingParamFingerprints === undefined
      ? {}
      : {
          trailingParamFingerprints: cloneTrailingParamFingerprints(
            table.trailingParamFingerprints,
          ),
        }),

    dynamicRoot: cloneDynamicNode(table.dynamicRoot),

    usesDynamicTrie: table.usesDynamicTrie,
  };
}

function cloneDynamicNode(node: DynamicNode): DynamicNode {
  let staticChildren: Map<string, DynamicNode> | undefined;

  const existingStaticChildren = node.staticChildren;

  if (existingStaticChildren !== undefined) {
    staticChildren = new Map();

    for (const [segment, child] of existingStaticChildren) {
      staticChildren.set(segment, cloneDynamicNode(child));
    }
  }

  return {
    staticChildren,

    paramChild:
      node.paramChild === undefined
        ? undefined
        : cloneDynamicNode(node.paramChild),

    /*
     * DynamicRoute is immutable after registration.
     * The transactional tree may safely share the
     * already-installed route leaf value.
     */
    route: node.route,
  };
}

function registerRouteIntoTable(
  table: MethodRoutes,

  route: RuntimeRouteRecord,
): boolean {
  const segments = splitPath(route.path);

  const paramNames: string[] = [];

  let hasParams = false;

  for (const segment of segments) {
    if (segment.startsWith(":")) {
      hasParams = true;

      paramNames.push(segment.slice(1));
    }
  }

  /*
   * Exact static routes.
   */
  if (!hasParams) {
    if (table.staticRoutes.has(route.path)) {
      throw duplicateRoute(route);
    }

    table.staticRoutes.set(route.path, route);

    if (table.fastMapKind === FAST_MAP_TRAILING_ONLY) {
      table.fastMapKind = FAST_MAP_MIXED;
    }

    const pathLength = route.path.length;
    const staticPathLengthMin = table.staticPathLengthMin;
    const staticPathLeadMask = table.staticPathLeadMask;
    const staticPathLengthMax = table.staticPathLengthMax;

    if (staticPathLengthMin !== undefined && pathLength < staticPathLengthMin) {
      table.staticPathLengthMin = pathLength;
    }

    if (staticPathLeadMask !== undefined) {
      const leadCode = route.path.charCodeAt(1) & 31;
      table.staticPathLeadMask = staticPathLeadMask | (1 << leadCode);
    }

    if (staticPathLengthMax !== undefined && pathLength > staticPathLengthMax) {
      table.staticPathLengthMax = pathLength;
    }

    return false;
  }

  const finalSegment = segments[segments.length - 1];

  const trailingParamName =
    paramNames.length === 1 && finalSegment?.startsWith(":")
      ? paramNames[0]
      : undefined;

  if (trailingParamName !== undefined && !table.usesDynamicTrie) {
    if (table.fastMapKind === FAST_MAP_STATIC_ONLY) {
      table.fastMapKind =
        table.staticRoutes.size === 0 ? FAST_MAP_TRAILING_ONLY : FAST_MAP_MIXED;
    }

    const slash = route.path.lastIndexOf("/");

    if (slash >= 0) {
      const prefix = route.path.slice(0, slash + 1);

      const trailingRoute = {
        route,

        paramName: trailingParamName,
      };

      if (table.trailingParamFingerprints !== undefined) {
        if (!registerTrailingFingerprint(table, prefix, trailingRoute)) {
          throw duplicateRoute(route);
        }

        return true;
      }

      const trailingParamRoutes = table.trailingParamRoutes;

      if (trailingParamRoutes !== undefined) {
        if (trailingParamRoutes.has(prefix)) {
          throw duplicateRoute(route);
        }

        trailingParamRoutes.set(prefix, trailingRoute);

        return true;
      }

      if (!registerTrailingFingerprint(table, prefix, trailingRoute)) {
        throw duplicateRoute(route);
      }

      return true;
    }
  }

  if (!table.usesDynamicTrie) {
    migrateTrailingRoutesToTrie(table);

    delete table.fastMapKind;
    table.usesDynamicTrie = true;
  }

  registerDynamicRoute(
    table.dynamicRoot,

    route,
  );

  return true;
}

function migrateTrailingRoutesToTrie(table: MethodRoutes): void {
  const trailingParamFingerprints = table.trailingParamFingerprints;

  if (trailingParamFingerprints !== undefined) {
    for (const entry of trailingParamFingerprints.values()) {
      if (entry.kind === "unique") {
        registerDynamicRoute(table.dynamicRoot, entry.trailingRoute.route);

        continue;
      }

      const secondary = entry.secondary;

      if (secondary === undefined) {
        for (const trailingRoute of entry.routes?.values() ?? []) {
          registerDynamicRoute(table.dynamicRoot, trailingRoute.route);
        }

        continue;
      }

      for (const secondaryEntry of secondary.values()) {
        if (secondaryEntry instanceof Map) {
          for (const trailingRoute of secondaryEntry.values()) {
            registerDynamicRoute(table.dynamicRoot, trailingRoute.route);
          }

          continue;
        }

        registerDynamicRoute(table.dynamicRoot, secondaryEntry.route);
      }
    }

    delete table.trailingParamFingerprints;

    table.trailingParamRoutes = undefined;

    return;
  }

  const trailingParamRoutes = table.trailingParamRoutes;

  if (!trailingParamRoutes) {
    return;
  }

  for (const trailingRoute of trailingParamRoutes.values()) {
    registerDynamicRoute(
      table.dynamicRoot,

      trailingRoute.route,
    );
  }

  /*
   * Generic mode never consults this structure.
   * Release it after migration.
   */
  table.trailingParamRoutes = undefined;
}

function registerTrailingFingerprint(
  table: MethodRoutes,

  prefix: string,

  trailingRoute: TrailingParamRoute,
): boolean {
  let fingerprints = table.trailingParamFingerprints;

  if (fingerprints === undefined) {
    fingerprints = new Map();

    table.trailingParamFingerprints = fingerprints;
  }

  const key = prefixFingerprint(prefix, prefix.length);

  const existing = fingerprints.get(key);

  if (existing === undefined) {
    fingerprints.set(key, {
      kind: "unique",

      prefix,

      trailingRoute,
    });

    return true;
  }

  if (existing.kind === "unique") {
    if (existing.prefix === prefix) {
      return false;
    }

    const secondary = new Map<number, TrailingSecondaryFingerprintEntry>();

    registerTrailingSecondaryFingerprint(
      secondary,
      existing.prefix,
      existing.trailingRoute,
    );

    registerTrailingSecondaryFingerprint(secondary, prefix, trailingRoute);

    fingerprints.set(key, {
      kind: "collision",

      secondary,

      ...(existing.trailingRoute.paramName === trailingRoute.paramName
        ? { paramName: trailingRoute.paramName }
        : {}),
    });

    return true;
  }

  const secondary = existing.secondary;

  if (secondary !== undefined) {
    if (
      existing.paramName !== undefined &&
      existing.paramName !== trailingRoute.paramName
    ) {
      delete existing.paramName;
    }

    return registerTrailingSecondaryFingerprint(
      secondary,
      prefix,
      trailingRoute,
    );
  }

  const routes = existing.routes;

  if (routes === undefined) {
    throw new Error("Invalid trailing fingerprint collision index");
  }

  if (routes.has(prefix)) {
    return false;
  }

  routes.set(prefix, trailingRoute);

  return true;
}

function registerTrailingSecondaryFingerprint(
  secondary: Map<number, TrailingSecondaryFingerprintEntry>,
  prefix: string,
  trailingRoute: TrailingParamRoute,
): boolean {
  const key = secondaryPrefixFingerprint(prefix, prefix.length);
  const existing = secondary.get(key);
  const collisionRoute: TrailingCollisionRoute = {
    route: trailingRoute.route,
    prefix,
  };

  if (existing === undefined) {
    secondary.set(key, collisionRoute);
    return true;
  }

  if (existing instanceof Map) {
    if (existing.has(prefix)) {
      return false;
    }

    existing.set(prefix, collisionRoute);
    return true;
  }

  if (existing.prefix === prefix) {
    return false;
  }

  secondary.set(
    key,
    new Map([
      [existing.prefix, existing],
      [prefix, collisionRoute],
    ]),
  );

  return true;
}

function trailingRouteParamName(
  route: TrailingParamRoute | TrailingCollisionRoute,
): string {
  if ("paramName" in route) {
    return route.paramName;
  }

  return route.route.path.slice(route.prefix.length + 1);
}

function cloneTrailingParamFingerprints(
  fingerprints: Map<number, TrailingFingerprintEntry>,
): Map<number, TrailingFingerprintEntry> {
  const cloned = new Map<number, TrailingFingerprintEntry>();

  for (const [key, entry] of fingerprints) {
    if (entry.kind === "unique") {
      cloned.set(key, entry);
      continue;
    }

    const secondary = entry.secondary;

    if (secondary === undefined) {
      cloned.set(key, {
        kind: "collision",
        ...(entry.routes === undefined
          ? {}
          : { routes: new Map(entry.routes) }),
        ...(entry.paramName === undefined
          ? {}
          : { paramName: entry.paramName }),
      });
      continue;
    }

    const clonedSecondary = new Map<
      number,
      TrailingSecondaryFingerprintEntry
    >();

    for (const [secondaryKey, secondaryEntry] of secondary) {
      clonedSecondary.set(
        secondaryKey,
        secondaryEntry instanceof Map
          ? new Map(secondaryEntry)
          : secondaryEntry,
      );
    }

    cloned.set(key, {
      kind: "collision",
      secondary: clonedSecondary,
      ...(entry.paramName === undefined ? {} : { paramName: entry.paramName }),
    });
  }

  return cloned;
}

function prefixFingerprint(value: string, end: number): number {
  let hash = Math.imul(end, -1640531527);

  hash = Math.imul(hash ^ codeBefore(value, end, 2), -2048144789);

  hash = Math.imul(hash ^ codeBefore(value, end, 3), -1028477387);

  hash = Math.imul(hash ^ codeBefore(value, end, 4), 668265263);

  hash = Math.imul(hash ^ codeBefore(value, end, 5), 374761393);

  return hash | 0;
}

function prefixFingerprintRange(
  value: string,
  absoluteEnd: number,
  prefixLength: number,
): number {
  let hash = Math.imul(prefixLength, -1640531527);

  hash = Math.imul(hash ^ codeBefore(value, absoluteEnd, 2), -2048144789);
  hash = Math.imul(hash ^ codeBefore(value, absoluteEnd, 3), -1028477387);
  hash = Math.imul(hash ^ codeBefore(value, absoluteEnd, 4), 668265263);
  hash = Math.imul(hash ^ codeBefore(value, absoluteEnd, 5), 374761393);

  return hash | 0;
}

function secondaryPrefixFingerprint(value: string, end: number): number {
  let hash = Math.imul(end ^ 0x51ed270b, -1640531527);

  hash = Math.imul(hash ^ codeBefore(value, end, 6), -2048144789);
  hash = Math.imul(hash ^ codeBefore(value, end, 7), -1028477387);
  hash = Math.imul(hash ^ codeBefore(value, end, 8), 668265263);
  hash = Math.imul(hash ^ codeBefore(value, end, 9), 374761393);

  return hash | 0;
}

function secondaryPrefixFingerprintRange(
  value: string,
  absoluteEnd: number,
  prefixLength: number,
): number {
  let hash = Math.imul(prefixLength ^ 0x51ed270b, -1640531527);

  hash = Math.imul(hash ^ codeBefore(value, absoluteEnd, 6), -2048144789);
  hash = Math.imul(hash ^ codeBefore(value, absoluteEnd, 7), -1028477387);
  hash = Math.imul(hash ^ codeBefore(value, absoluteEnd, 8), 668265263);
  hash = Math.imul(hash ^ codeBefore(value, absoluteEnd, 9), 374761393);

  return hash | 0;
}

function codeBefore(value: string, end: number, distance: number): number {
  const index = end - distance;

  return index >= 0 ? value.charCodeAt(index) : 0;
}

function registerDynamicRoute(
  root: DynamicNode,

  route: RuntimeRouteRecord,
): void {
  const segments = splitPath(route.path);

  const paramNames: string[] = [];

  let node = root;

  for (const segment of segments) {
    if (segment.startsWith(":")) {
      paramNames.push(segment.slice(1));

      if (!node.paramChild) {
        node.paramChild = createDynamicNode();
      }

      node = node.paramChild;

      continue;
    }

    if (!node.staticChildren) {
      node.staticChildren = new Map();
    }

    let child = node.staticChildren.get(segment);

    if (!child) {
      child = createDynamicNode();

      node.staticChildren.set(segment, child);
    }

    node = child;
  }

  if (node.route) {
    throw duplicateRoute(route);
  }

  node.route = {
    route,

    paramNames,
  };
}

function createDynamicNode(): DynamicNode {
  return {
    staticChildren: undefined,

    paramChild: undefined,

    route: undefined,
  };
}

function matchDynamicPath(
  root: DynamicNode,

  pathname: string,

  captures: number[],
): DynamicRoute | undefined {
  if (pathname === "/") {
    return root.route;
  }

  return matchDynamicNode(root, pathname, 1, captures);
}

function matchDynamicNode(
  node: DynamicNode,

  pathname: string,

  start: number,

  captures: number[],
): DynamicRoute | undefined {
  let end = pathname.indexOf("/", start);

  const isLast = end === -1;

  if (isLast) {
    end = pathname.length;
  }

  const next = end + 1;

  if (node.staticChildren) {
    const segment = pathname.slice(start, end);

    const staticChild = node.staticChildren.get(segment);

    if (staticChild) {
      const matched = isLast
        ? staticChild.route
        : matchDynamicNode(
            staticChild,

            pathname,

            next,

            captures,
          );

      if (matched) {
        return matched;
      }
    }
  }

  if (node.paramChild) {
    captures.push(start, end);

    const matched = isLast
      ? node.paramChild.route
      : matchDynamicNode(
          node.paramChild,

          pathname,

          next,

          captures,
        );

    if (matched) {
      return matched;
    }

    captures.length -= 2;
  }

  return undefined;
}

function splitPath(path: string): string[] {
  if (path === "/") {
    return [];
  }

  return path.slice(1).split("/");
}

function decodeParam(value: string): string {
  if (!value.includes("%")) {
    return value;
  }

  return decodeURIComponent(value);
}

function duplicateRoute(route: RuntimeRouteRecord): Error {
  return new Error(`Duplicate route: ` + `${route.method} ` + `${route.path}`);
}

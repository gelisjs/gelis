import type { RuntimeRouteRecord } from "./types";

interface DynamicRoute {
  readonly route: RuntimeRouteRecord;

  readonly paramNames: readonly string[];
}

interface DynamicNode {
  staticChildren: Map<string, DynamicNode> | undefined;

  paramChild: DynamicNode | undefined;

  route: DynamicRoute | undefined;
}

interface TrailingParamRoute {
  readonly route: RuntimeRouteRecord;

  readonly paramName: string;
}

interface MethodRoutes {
  readonly staticRoutes: Map<string, RuntimeRouteRecord>;

  trailingParamRoutes: Map<string, TrailingParamRoute> | undefined;

  readonly dynamicRoot: DynamicNode;
}

export interface RuntimeRouteMatch {
  readonly route: RuntimeRouteRecord;

  readonly params: Record<string, string>;
}

const EMPTY_PARAMS = Object.freeze({}) as Record<string, string>;

export class Router {
  readonly #methods = new Map<string, MethodRoutes>();

  register(route: RuntimeRouteRecord): void {
    const table = this.getOrCreateMethod(route.method);

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
     * Exact static routes remain completely
     * unchanged and keep highest precedence.
     */
    if (!hasParams) {
      if (table.staticRoutes.has(route.path)) {
        throw duplicateRoute(route);
      }

      table.staticRoutes.set(route.path, route);

      return;
    }

    /*
     * P5-D trailing-param fast lane.
     *
     * Eligible shape:
     *
     *   /users/:id
     *   /r/4999/:id
     *   /:id
     *
     * Requirements:
     * - exactly one named param
     * - param is the final segment
     * - therefore every preceding segment is static
     *
     * Everything else stays on the generic trie.
     */
    const finalSegment = segments[segments.length - 1];

    const trailingParamName =
      paramNames.length === 1 && finalSegment?.startsWith(":")
        ? paramNames[0]
        : undefined;

    if (trailingParamName !== undefined) {
      const slash = route.path.lastIndexOf("/");

      if (slash >= 0) {
        const prefix = route.path.slice(0, slash + 1);

        let trailingParamRoutes = table.trailingParamRoutes;

        if (!trailingParamRoutes) {
          trailingParamRoutes = new Map();

          table.trailingParamRoutes = trailingParamRoutes;
        }

        /*
         * /users/:id
         * /users/:userId
         *
         * are semantically equivalent routes,
         * because their static prefix is identical.
         */
        if (trailingParamRoutes.has(prefix)) {
          throw duplicateRoute(route);
        }

        trailingParamRoutes.set(prefix, {
          route,

          paramName: trailingParamName,
        });

        return;
      }
    }

    /*
     * Generic dynamic routes retain the existing
     * trie implementation and semantics.
     */
    let node = table.dynamicRoot;

    for (const segment of segments) {
      if (segment.startsWith(":")) {
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

  match(method: string, pathname: string): RuntimeRouteMatch | undefined {
    const table = this.#methods.get(method);

    if (!table) {
      return undefined;
    }

    /*
     * Exact static route always wins.
     */
    const staticRoute = table.staticRoutes.get(pathname);

    if (staticRoute) {
      return {
        route: staticRoute,

        params: EMPTY_PARAMS,
      };
    }

    /*
     * P5-D fast lane.
     *
     * trailingParamRoutes is lazy. Methods without
     * eligible routes do not pay lastIndexOf/slice.
     *
     * pathname "/" must skip this path because the
     * old trie intentionally does not allow /:id
     * to match the root URL.
     */
    const trailingParamRoutes = table.trailingParamRoutes;

    if (pathname !== "/" && trailingParamRoutes) {
      const slash = pathname.lastIndexOf("/");

      if (slash >= 0) {
        const prefix = pathname.slice(0, slash + 1);

        const trailingRoute = trailingParamRoutes.get(prefix);

        if (trailingRoute) {
          const value = pathname.slice(slash + 1);

          return {
            route: trailingRoute.route,

            params: {
              [trailingRoute.paramName]: decodeParam(value),
            },
          };
        }
      }
    }

    /*
     * Generic trie fallback remains unchanged.
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

  private getOrCreateMethod(method: string): MethodRoutes {
    const existing = this.#methods.get(method);

    if (existing) {
      return existing;
    }

    const created: MethodRoutes = {
      staticRoutes: new Map(),

      trailingParamRoutes: undefined,

      dynamicRoot: createDynamicNode(),
    };

    this.#methods.set(method, created);

    return created;
  }
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
        : matchDynamicNode(staticChild, pathname, next, captures);

      if (matched) {
        return matched;
      }
    }
  }

  if (node.paramChild) {
    captures.push(start, end);

    const matched = isLast
      ? node.paramChild.route
      : matchDynamicNode(node.paramChild, pathname, next, captures);

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

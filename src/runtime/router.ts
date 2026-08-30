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

interface MethodRoutes {
  readonly staticRoutes: Map<string, RuntimeRouteRecord>;

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

    if (!hasParams) {
      if (table.staticRoutes.has(route.path)) {
        throw duplicateRoute(route);
      }

      table.staticRoutes.set(route.path, route);

      return;
    }

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

    const staticRoute = table.staticRoutes.get(pathname);

    if (staticRoute) {
      return {
        route: staticRoute,

        params: EMPTY_PARAMS,
      };
    }

    const segments = splitPath(pathname);

    const captures: string[] = [];

    const dynamicRoute = matchDynamic(table.dynamicRoot, segments, 0, captures);

    if (!dynamicRoute) {
      return undefined;
    }

    const params: Record<string, string> = {};

    for (let index = 0; index < dynamicRoute.paramNames.length; index++) {
      const name = dynamicRoute.paramNames[index];

      const value = captures[index];

      if (name === undefined || value === undefined) {
        continue;
      }

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

function matchDynamic(
  node: DynamicNode,

  segments: readonly string[],

  index: number,

  captures: string[],
): DynamicRoute | undefined {
  if (index === segments.length) {
    return node.route;
  }

  const segment = segments[index];

  if (segment === undefined) {
    return undefined;
  }

  const staticChild = node.staticChildren?.get(segment);

  if (staticChild) {
    const matched = matchDynamic(staticChild, segments, index + 1, captures);

    if (matched) {
      return matched;
    }
  }

  if (node.paramChild) {
    captures.push(segment);

    const matched = matchDynamic(
      node.paramChild,
      segments,
      index + 1,
      captures,
    );

    if (matched) {
      return matched;
    }

    captures.pop();
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

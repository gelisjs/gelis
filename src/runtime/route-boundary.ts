export const GELIS_RUNTIME_ROUTE_BOUNDARY_POLICY = Symbol(
  "gelis.internal.route-boundary-policy",
);

export interface RuntimeRouteExecutionBoundary {
  readonly family: symbol;
  readonly owner: object;

  run(
    request: Request,
    execute: () => Response | Promise<Response>,
  ): Response | Promise<Response>;
}

interface RuntimeRouteBoundaryPolicyCarrier {
  readonly [GELIS_RUNTIME_ROUTE_BOUNDARY_POLICY]: RuntimeRouteExecutionBoundary;
}

export function resolveRuntimeRouteExecutionBoundary(
  value: unknown,
): RuntimeRouteExecutionBoundary {
  if (
    (typeof value !== "object" || value === null) &&
    typeof value !== "function"
  ) {
    throw new TypeError("Invalid Gelis route execution policy");
  }

  const boundary = (value as Partial<RuntimeRouteBoundaryPolicyCarrier>)[
    GELIS_RUNTIME_ROUTE_BOUNDARY_POLICY
  ];

  if (
    boundary === undefined ||
    typeof boundary !== "object" ||
    typeof boundary.family !== "symbol" ||
    (typeof boundary.owner !== "object" &&
      typeof boundary.owner !== "function") ||
    boundary.owner === null ||
    typeof boundary.run !== "function"
  ) {
    throw new TypeError("Invalid Gelis route execution policy");
  }

  return boundary;
}

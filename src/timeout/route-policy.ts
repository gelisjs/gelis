import { GELIS_RUNTIME_ROUTE_BOUNDARY_POLICY } from "../runtime/route-boundary";

import type { RuntimeRouteExecutionBoundary } from "../runtime/route-boundary";
import type { TimeoutCapability } from "./index";

const TIMEOUT_ROUTE_POLICY = Symbol("gelis.timeout.route-policy");

export const TIMEOUT_ROUTE_BOUNDARY_FAMILY = Symbol(
  "gelis.timeout.route-boundary-family",
);

export interface TimeoutRoutePolicy {
  readonly [TIMEOUT_ROUTE_POLICY]: true;
}

export interface RuntimeTimeoutRoutePolicy extends TimeoutRoutePolicy {
  readonly duration: number;
  readonly owner: TimeoutCapability;
  readonly [GELIS_RUNTIME_ROUTE_BOUNDARY_POLICY]: RuntimeRouteExecutionBoundary;
}

export function createTimeoutRoutePolicy(
  owner: TimeoutCapability,
  duration: number,
  run: RuntimeRouteExecutionBoundary["run"],
): TimeoutRoutePolicy {
  const boundary: RuntimeRouteExecutionBoundary = Object.freeze({
    family: TIMEOUT_ROUTE_BOUNDARY_FAMILY,
    owner,
    run,
  });

  return Object.freeze({
    [TIMEOUT_ROUTE_POLICY]: true as const,
    [GELIS_RUNTIME_ROUTE_BOUNDARY_POLICY]: boundary,
    duration,
    owner,
  }) as RuntimeTimeoutRoutePolicy;
}

export function readTimeoutRoutePolicy(
  value: TimeoutRoutePolicy,
): RuntimeTimeoutRoutePolicy {
  return value as RuntimeTimeoutRoutePolicy;
}

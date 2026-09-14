import type { TimeoutCapability } from "./index";

const TIMEOUT_ROUTE_POLICY = Symbol("gelis.timeout.route-policy");

export interface TimeoutRoutePolicy {
  readonly [TIMEOUT_ROUTE_POLICY]: true;
}

export interface RuntimeTimeoutRoutePolicy extends TimeoutRoutePolicy {
  readonly duration: number;
  readonly owner: TimeoutCapability;
}

export function createTimeoutRoutePolicy(
  owner: TimeoutCapability,
  duration: number,
): TimeoutRoutePolicy {
  return Object.freeze({
    [TIMEOUT_ROUTE_POLICY]: true as const,
    duration,
    owner,
  }) as RuntimeTimeoutRoutePolicy;
}

export function readTimeoutRoutePolicy(
  value: TimeoutRoutePolicy,
): RuntimeTimeoutRoutePolicy {
  return value as RuntimeTimeoutRoutePolicy;
}

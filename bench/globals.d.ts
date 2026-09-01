type JsonObject = Record<string, unknown>;

type SyncOperation = () => void;

type AsyncOperation = () => Promise<void>;

type RuntimeMode = "sync" | "sync-throw" | "async";

interface RuntimeResultRow {
  scenario: string;
  mode: RuntimeMode;
  iterations: number;
  nsPerOp: number;
  opsPerSecond: number;
  samples: number[];
}

interface RuntimeComparisonRow {
  scenario: string;
  reference: string;
  scenarioNs: number;
  referenceNs: number;
  deltaNs: number;
  deltaPercent: number;
}

interface RuntimeConfigurationRow {
  scenario: string;
  routes: number;
  milliseconds: number;
  nanosecondsPerRoute: number;
}

interface OhaJson {
  metrics?: {
    requests_per_sec?: unknown;
    success_rate?: unknown;
    latency_ms?: Partial<Record<"p50" | "p95" | "p99", unknown>>;
  };
  summary?: {
    requestsPerSec?: unknown;
    successRate?: unknown;
  };
  latencyPercentiles?: Partial<Record<"p50" | "p95" | "p99", unknown>>;
}

interface OhaSample {
  requestsPerSecond: number;
  successRate: number;
  latency: {
    p50: number;
    p95: number;
    p99: number;
  };
}

interface HttpFramework {
  name: string;
  file?: string;
  server?: string;
  env?: Record<string, string>;
}

interface UrlSet {
  urls: string[];
  file: string;
  readinessUrl: string;
}

interface HttpCaseResultRow {
  framework: string;
  case: string;
  sample: number;
  requestsPerSecond: number;
  p50: number;
  p95: number;
  p99: number;
  successRate: number;
}

interface HttpCaseAggregateRow {
  framework: string;
  case: string;
  requestsMedian: number;
  requestsMin: number;
  requestsMax: number;
  requestsCv: number;
  p50: number;
  p95: number;
  p99: number;
  successRate: number;
  samples?: OhaSample[];
}

interface HttpNestedAggregateRow {
  framework: string;
  case: string;
  requestsPerSecond: {
    median: number;
    min: number;
    max: number;
    cv: number;
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
  };
  successRate: number;
  samples: OhaSample[];
}

interface HttpThroughputComparisonRow {
  case: string;
  competitor: string;
  gelis: number;
  competitorValue: number;
  advantage: number;
}

interface HttpFeatureDeltaRow {
  framework: string;
  baselineCase: string;
  featureCase: string;
  plainRequestsPerSecond: number;
  featureRequestsPerSecond: number;
  deltaPercent: number;
}

interface HttpRouteCase {
  routeKind: "static" | "dynamic";
  bodyKind: "raw" | "json";
}

interface HttpRouteResultRow {
  framework: string;
  routeKind: HttpRouteCase["routeKind"];
  bodyKind: HttpRouteCase["bodyKind"];
  sample: number;
  requestsPerSecond: number;
  p50: number;
  p95: number;
  p99: number;
  successRate: number;
}

interface HttpRouteAggregateRow {
  framework: string;
  routeKind: HttpRouteCase["routeKind"];
  bodyKind: HttpRouteCase["bodyKind"];
  requestsMedian: number;
  requestsMin: number;
  requestsMax: number;
  requestsCv: number;
  p50: number;
  p95: number;
  p99: number;
  successRate: number;
  samples?: number[];
}

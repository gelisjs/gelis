import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Gelis } from "../../src";
import type { StandardSchemaV1 } from "../../src";

const ROUTES = 5_000;
const SAMPLES = 61;
const ITERATIONS = 150_000;
const WARMUP = 50_000;

type Runner = (iterations: number) => number;
type Pair = { name: string; control: Runner; candidate: Runner };
type Sample = {
  control: number;
  candidate: number;
  delta: number;
  deltaPercent: number;
  controlFirst: boolean;
};
type Scope = { readonly userId: number; readonly tenantId: number };
type BenchApp = {
  app: Gelis;
  request: Request;
  stats: { deriveCalls: number };
};

const ROOT = resolve(import.meta.dir, "../..");
const sourceDir = resolve(ROOT, "src");
const tempRoot = mkdtempSync(join(tmpdir(), "gelis-a9-order-"));
const controlSourceDir = join(tempRoot, "src");

let epoch = 0;
let numericSink = 0;
const scopePool = new Array<Scope>(64);
for (let i = 0; i < scopePool.length; i++) {
  scopePool[i] = { userId: i + 1, tenantId: i * 3 + 7 };
}

const successResponse = new Response(null, { status: 204 });
const earlyResponse = new Response(null, { status: 401 });

const Query = createSchema<
  Record<string, string | string[]>,
  { readonly page: number }
>((value) => {
  const page = (value as Record<string, string | string[]>).page;
  if (typeof page !== "string") {
    return { issues: [{ message: "Missing page" }] };
  }
  return { value: { page: Number(page) } };
});

try {
  cpSync(sourceDir, controlSourceDir, { recursive: true });
  patchControlApp(join(controlSourceDir, "app.ts"));

  const controlModule = (await import(
    `${pathToFileURL(join(controlSourceDir, "index.ts")).href}?a9=${Date.now()}`
  )) as { Gelis: typeof Gelis };
  const ControlGelis = controlModule.Gelis;

  const plainControl = buildPlainPass(ControlGelis);
  const plainCandidate = buildPlainPass(Gelis);
  const richControl = buildRichPass(ControlGelis);
  const richCandidate = buildRichPass(Gelis);
  const shortControl = buildShortCircuit(ControlGelis);
  const shortCandidate = buildShortCircuit(Gelis);

  assertCorrectness(
    plainControl,
    plainCandidate,
    richControl,
    richCandidate,
    shortControl,
    shortCandidate,
  );

  const pairs: Pair[] = [
    {
      name: "request-scope-global-pass",
      control: createRunner(plainControl.app, plainControl.request),
      candidate: createRunner(plainCandidate.app, plainCandidate.request),
    },
    {
      name: "request-scope-rich-pass",
      control: createRunner(richControl.app, richControl.request),
      candidate: createRunner(richCandidate.app, richCandidate.request),
    },
    {
      name: "global-short-circuit",
      control: createRunner(shortControl.app, shortControl.request),
      candidate: createRunner(shortCandidate.app, shortCandidate.request),
    },
  ];

  for (const pair of pairs) {
    pair.control(WARMUP);
    pair.candidate(WARMUP);
  }

  const summaries = pairs.map((pair, index) =>
    summarize(pair.name, runPaired(pair.control, pair.candidate, index)),
  );

  console.log("\nGelis P8-A9.2 request-scope execution-order paired benchmark");
  console.log(`Runtime:       bun ${Bun.version}`);
  console.log(`Routes/app:    ${ROUTES.toLocaleString()}`);
  console.log(`Samples:       ${SAMPLES}`);
  console.log(`Iterations:    ${ITERATIONS.toLocaleString()} / side / sample`);
  console.log("Control:       A9.1 derive -> global before");
  console.log("Candidate:     A9.2 global before -> derive");
  console.log(
    "Rich topology: sync query validation + global before + request derive + local before/after",
  );
  console.log();
  console.table(summaries);
  console.log(
    `\nShort-circuit derive calls: control=${shortControl.stats.deriveCalls.toLocaleString()}, candidate=${shortCandidate.stats.deriveCalls.toLocaleString()}`,
  );
  console.log(`Numeric sink: ${numericSink}`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function buildPlainPass(GelisCtor: typeof Gelis): BenchApp {
  const app = new GelisCtor();
  const stats = { deriveCalls: 0 };
  const routes = app.requestScope(({ params }) => {
    stats.deriveCalls++;
    const scope = scopePool[(epoch + (params.id ?? "").length) & 63]!;
    numericSink ^= scope.userId;
    return scope;
  });

  for (let i = 0; i < ROUTES; i++) {
    const path = `/plain/${i}/:id` as const;
    routes.get(path, ({ params }, scope) => {
      numericSink ^= params.id!.length + scope.tenantId + i;
      return successResponse;
    });
  }

  app.onBeforeHandle(({ request }) => {
    numericSink ^= request.method.length;
    return undefined;
  });

  return {
    app,
    request: new Request("http://gelis.test/plain/4999/abc"),
    stats,
  };
}

function buildRichPass(GelisCtor: typeof Gelis): BenchApp {
  const app = new GelisCtor();
  const stats = { deriveCalls: 0 };
  const routes = app.requestScope(({ params, query }) => {
    stats.deriveCalls++;
    const page = (query as { page: number }).page;
    const scope = scopePool[(epoch + (params.id ?? "").length + page) & 63]!;
    numericSink ^= scope.userId + page;
    return scope;
  });

  for (let i = 0; i < ROUTES; i++) {
    const path = `/rich/${i}/:id` as const;
    routes.get(
      path,
      { query: Query },
      ({ params, query }, scope) => {
        numericSink ^= params.id!.length + query.page + scope.tenantId + i;
        return successResponse;
      },
      {
        beforeHandle({ query }, scope) {
          numericSink ^= query.page + scope.userId + i;
        },
        afterHandle(_context, result, scope) {
          numericSink ^= result.status + scope.tenantId + i;
        },
      },
    );
  }

  app.onBeforeHandle(({ request }) => {
    numericSink ^= request.method.length;
    return undefined;
  });

  return {
    app,
    request: new Request("http://gelis.test/rich/4999/abc?page=3"),
    stats,
  };
}

function buildShortCircuit(GelisCtor: typeof Gelis): BenchApp {
  const app = new GelisCtor();
  const stats = { deriveCalls: 0 };
  const routes = app.requestScope(({ params }) => {
    stats.deriveCalls++;
    const scope = scopePool[(epoch + (params.id ?? "").length) & 63]!;
    numericSink ^= scope.userId + scope.tenantId;
    return scope;
  });

  for (let i = 0; i < ROUTES; i++) {
    const path = `/blocked/${i}/:id` as const;
    routes.get(path, ({ params }, scope) => {
      numericSink ^= params.id!.length + scope.userId + i;
      return successResponse;
    });
  }

  app.onBeforeHandle(() => earlyResponse);

  return {
    app,
    request: new Request("http://gelis.test/blocked/4999/abc"),
    stats,
  };
}

function assertCorrectness(
  plainControl: BenchApp,
  plainCandidate: BenchApp,
  richControl: BenchApp,
  richCandidate: BenchApp,
  shortControl: BenchApp,
  shortCandidate: BenchApp,
): void {
  assertStatus(plainControl, 204);
  assertStatus(plainCandidate, 204);
  assertStatus(richControl, 204);
  assertStatus(richCandidate, 204);

  shortControl.stats.deriveCalls = 0;
  shortCandidate.stats.deriveCalls = 0;
  assertStatus(shortControl, 401);
  assertStatus(shortCandidate, 401);

  if (shortControl.stats.deriveCalls !== 1) {
    throw new Error(
      `A9.1 control must derive before global short-circuit; got ${shortControl.stats.deriveCalls}`,
    );
  }
  if (shortCandidate.stats.deriveCalls !== 0) {
    throw new Error(
      `A9.2 candidate must skip derive after global short-circuit; got ${shortCandidate.stats.deriveCalls}`,
    );
  }

  shortControl.stats.deriveCalls = 0;
  shortCandidate.stats.deriveCalls = 0;
}

function assertStatus(target: BenchApp, expected: number): void {
  const result = target.app.fetch(target.request);
  if (result instanceof Promise) {
    throw new Error("Unexpected async result during A9.2 correctness check");
  }
  if (result.status !== expected) {
    throw new Error(`Unexpected A9.2 response status: ${result.status}`);
  }
}

function createRunner(app: Gelis, request: Request): Runner {
  return (iterations) => {
    let local = 0;
    for (let i = 0; i < iterations; i++) {
      const result = app.fetch(request);
      if (result instanceof Promise) {
        throw new Error(
          "Unexpected async result in synchronous A9.2 benchmark",
        );
      }
      local ^= result.status;
    }
    numericSink ^= local;
    return local;
  };
}

function runPaired(
  control: Runner,
  candidate: Runner,
  pairIndex: number,
): Sample[] {
  const samples: Sample[] = [];
  for (let sampleIndex = 0; sampleIndex < SAMPLES; sampleIndex++) {
    epoch = (sampleIndex + pairIndex * 17 + 11) & 63;
    const controlFirst = sampleIndex % 2 === 0;
    let controlNs: number;
    let candidateNs: number;

    if (controlFirst) {
      Bun.gc(true);
      controlNs = measure(control);
      Bun.gc(true);
      candidateNs = measure(candidate);
    } else {
      Bun.gc(true);
      candidateNs = measure(candidate);
      Bun.gc(true);
      controlNs = measure(control);
    }

    const delta = candidateNs - controlNs;
    samples.push({
      control: controlNs,
      candidate: candidateNs,
      delta,
      deltaPercent: (delta / controlNs) * 100,
      controlFirst,
    });
  }
  return samples;
}

function measure(runner: Runner): number {
  const start = Bun.nanoseconds();
  runner(ITERATIONS);
  return (Bun.nanoseconds() - start) / ITERATIONS;
}

function summarize(name: string, samples: readonly Sample[]) {
  const controlValues = samples.map((sample) => sample.control);
  const candidateValues = samples.map((sample) => sample.candidate);
  const controlFirst = samples.filter((sample) => sample.controlFirst);
  const candidateFirst = samples.filter((sample) => !sample.controlFirst);

  return {
    case: name,
    "control ns": round(median(controlValues), 2),
    "candidate ns": round(median(candidateValues), 2),
    "delta ns": signed(median(samples.map((sample) => sample.delta)), 2),
    "delta %": signed(median(samples.map((sample) => sample.deltaPercent)), 2),
    "control cv %": round(cv(controlValues), 2),
    "candidate cv %": round(cv(candidateValues), 2),
    wins: `${samples.filter((sample) => sample.candidate < sample.control).length}/${samples.length}`,
    "control-first %": signed(
      median(controlFirst.map((sample) => sample.deltaPercent)),
      2,
    ),
    "candidate-first %": signed(
      median(candidateFirst.map((sample) => sample.deltaPercent)),
      2,
    ),
  };
}

function cv(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => {
      const delta = value - mean;
      return sum + delta * delta;
    }, 0) / values.length;
  return (Math.sqrt(variance) / mean) * 100;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function signed(value: number, digits: number): string {
  const result = round(value, digits);
  return `${result > 0 ? "+" : ""}${result}`;
}

function createSchema<Input = unknown, Output = Input>(
  validate: (
    value: unknown,
  ) =>
    StandardSchemaV1.Result<Output> | Promise<StandardSchemaV1.Result<Output>>,
): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1,
      vendor: "gelis-bench",
      validate,
      types: {
        input: undefined as Input,
        output: undefined as Output,
      },
    },
  };
}

function patchControlApp(path: string): void {
  let source = readFileSync(path, "utf8");
  source = replaceRegion(
    source,
    "function invokeRequestScopeValidatedRoute(",
    "function deriveRequestScopeAfterGlobalBefore(",
    oldValidatedExecutor(),
  );
  source = replaceRegion(
    source,
    "function deriveRequestScopeAfterGlobalBefore(",
    "function invokeLocalRequestScopeBefore(",
    oldScopeExecutor(),
  );
  writeFileSync(path, source);
}

function replaceRegion(
  source: string,
  startMarker: string,
  endMarker: string,
  replacement: string,
): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1) {
    throw new Error(
      `Missing A9.2 source markers: ${startMarker} -> ${endMarker}`,
    );
  }
  return source.slice(0, start) + replacement + "\n\n" + source.slice(end);
}

function oldValidatedExecutor(): string {
  return `function invokeRequestScopeValidatedRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
): Response | Promise<Response> {
  const requestScope = route.requestScope;

  if (requestScope === undefined) {
    throw new Error("Missing Gelis request scope plan");
  }

  const context = createRuntimeContext(request, params, query, body);
  const scope = requestScope.derive(context);

  if (isPromiseLike(scope)) {
    return Promise.resolve(scope).then((resolvedScope) =>
      invokeRequestScopeWithScope(route, context, resolvedScope),
    );
  }

  return invokeRequestScopeWithScope(route, context, scope);
}`;
}

function oldScopeExecutor(): string {
  return `function invokeRequestScopeWithScope(
  route: RuntimeRouteRecord,

  context: RuntimeRouteContext,

  scope: unknown,
): Response | Promise<Response> {
  const globalBeforeHandle = route.beforeHandle;

  if (globalBeforeHandle === undefined) {
    return invokeLocalRequestScopeBefore(route, context, scope);
  }

  const early = globalBeforeHandle(context);

  if (isPromiseLike(early)) {
    return Promise.resolve(early).then((resolvedEarly) => {
      if (resolvedEarly !== undefined) {
        return normalizeResponse(resolvedEarly);
      }

      return invokeLocalRequestScopeBefore(route, context, scope);
    });
  }

  if (early !== undefined) {
    return normalizeResponse(early);
  }

  return invokeLocalRequestScopeBefore(route, context, scope);
}`;
}

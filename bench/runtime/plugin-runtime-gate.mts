import { Gelis, defineCapability, definePlugin } from "../../src";

import type { Capability, Plugin } from "../../src";

const ROUTES = 5_000;

const INSTALLED_PLUGIN_COUNT = 128;

const REQUEST_SAMPLES = 41;

const REQUEST_ITERATIONS = 300_000;

const REQUEST_WARMUP_ITERATIONS = 100_000;

const INSTALL_SAMPLES = 21;

const INSTALL_WARMUP_RUNS = 5;

const INSTALL_SIZES = [100, 1_000, 5_000] as const;

const REQUEST_MAX_DELTA_PERCENT = 3;

const INSTALL_NOOP_MAX_NS_PER_PLUGIN_5K = 2_500;

const INSTALL_CAPABILITY_MAX_NS_PER_PLUGIN_5K = 5_000;

const INSTALL_MAX_5K_VS_1K_NS_PER_PLUGIN = 1.5;

type Runner = (iterations: number) => number;

type RequestPair = {
  readonly name: string;

  readonly control: Runner;

  readonly candidate: Runner;
};

type RequestSample = {
  readonly control: number;

  readonly candidate: number;

  readonly delta: number;

  readonly deltaPercent: number;

  readonly controlFirst: boolean;
};

type RequestSummary = {
  readonly case: string;

  readonly controlMedian: number;

  readonly candidateMedian: number;

  readonly deltaMedian: number;

  readonly deltaPercentMedian: number;

  readonly controlCv: number;

  readonly candidateCv: number;

  readonly candidateWins: number;

  readonly samples: number;

  readonly controlFirstDeltaPercent: number;

  readonly candidateFirstDeltaPercent: number;
};

type InstallCase = {
  readonly name: string;

  readonly plugins: readonly Plugin[];
};

type InstallSummary = {
  readonly case: string;

  readonly plugins: number;

  readonly medianTotalNs: number;

  readonly medianNsPerPlugin: number;

  readonly cvPercent: number;

  readonly samples: number;
};

let numericSink = 0;

const sharedResponse = new Response(null, {
  status: 204,
});

const controlApp = new Gelis();

const candidateApp = new Gelis();

installRepresentativePlugins(candidateApp, INSTALLED_PLUGIN_COUNT);

registerRequestRoutes(controlApp);

registerRequestRoutes(candidateApp);

const requests = {
  plainStatic: new Request("http://gelis.test/plain/4998"),

  dynamicRaw: new Request("http://gelis.test/dynamic/4999/abc"),
} as const;

assertRequestCorrectness();

const requestPairs: readonly RequestPair[] = [
  {
    name: "plain-static-plugin-zero-overhead",

    control: createFetchRunner(controlApp, requests.plainStatic),

    candidate: createFetchRunner(candidateApp, requests.plainStatic),
  },

  {
    name: "dynamic-raw-plugin-zero-overhead",

    control: createFetchRunner(controlApp, requests.dynamicRaw),

    candidate: createFetchRunner(candidateApp, requests.dynamicRaw),
  },
];

for (const pair of requestPairs) {
  pair.control(REQUEST_WARMUP_ITERATIONS);

  pair.candidate(REQUEST_WARMUP_ITERATIONS);
}

const requestSummaries: RequestSummary[] = [];

for (let pairIndex = 0; pairIndex < requestPairs.length; pairIndex++) {
  const pair = requestPairs[pairIndex]!;

  requestSummaries.push(
    summarizeRequest(
      pair.name,

      runRequestPaired(pair.control, pair.candidate, pairIndex),
    ),
  );
}

const noopPlugins = createNoopPlugins(5_000);

const capabilityPlugins = createCapabilityChainPlugins(5_000);

const installCases: readonly InstallCase[] = [
  {
    name: "noop-plugin-install",

    plugins: noopPlugins,
  },

  {
    name: "capability-chain-install",

    plugins: capabilityPlugins,
  },
];

for (const installCase of installCases) {
  for (let warmup = 0; warmup < INSTALL_WARMUP_RUNS; warmup++) {
    runInstall(installCase.plugins, 100);
  }
}

const installSummaries: InstallSummary[] = [];

for (const size of INSTALL_SIZES) {
  for (const installCase of installCases) {
    installSummaries.push(
      measureInstallCase(installCase.name, installCase.plugins, size),
    );
  }
}

const requestGateRows = requestSummaries.map((summary) => ({
  case: summary.case,

  "delta %": round(summary.deltaPercentMedian, 2),

  "max %": REQUEST_MAX_DELTA_PERCENT,

  pass: summary.deltaPercentMedian <= REQUEST_MAX_DELTA_PERCENT,
}));

const noop1k = requiredInstallSummary(
  installSummaries,
  "noop-plugin-install",
  1_000,
);

const noop5k = requiredInstallSummary(
  installSummaries,
  "noop-plugin-install",
  5_000,
);

const capability1k = requiredInstallSummary(
  installSummaries,
  "capability-chain-install",
  1_000,
);

const capability5k = requiredInstallSummary(
  installSummaries,
  "capability-chain-install",
  5_000,
);

const noopGrowth = noop5k.medianNsPerPlugin / noop1k.medianNsPerPlugin;

const capabilityGrowth =
  capability5k.medianNsPerPlugin / capability1k.medianNsPerPlugin;

const installGateRows = [
  {
    case: "noop-plugin-install",

    "5k ns/plugin": round(noop5k.medianNsPerPlugin, 2),

    "max ns/plugin": INSTALL_NOOP_MAX_NS_PER_PLUGIN_5K,

    "5k/1k": round(noopGrowth, 3),

    "max growth": INSTALL_MAX_5K_VS_1K_NS_PER_PLUGIN,

    pass:
      noop5k.medianNsPerPlugin <= INSTALL_NOOP_MAX_NS_PER_PLUGIN_5K &&
      noopGrowth <= INSTALL_MAX_5K_VS_1K_NS_PER_PLUGIN,
  },

  {
    case: "capability-chain-install",

    "5k ns/plugin": round(capability5k.medianNsPerPlugin, 2),

    "max ns/plugin": INSTALL_CAPABILITY_MAX_NS_PER_PLUGIN_5K,

    "5k/1k": round(capabilityGrowth, 3),

    "max growth": INSTALL_MAX_5K_VS_1K_NS_PER_PLUGIN,

    pass:
      capability5k.medianNsPerPlugin <=
        INSTALL_CAPABILITY_MAX_NS_PER_PLUGIN_5K &&
      capabilityGrowth <= INSTALL_MAX_5K_VS_1K_NS_PER_PLUGIN,
  },
];

const requestPass = requestGateRows.every((row) => row.pass);

const installPass = installGateRows.every((row) => row.pass);

console.log("\nGelis P8-B3-B plugin runtime gate");

console.log(`Runtime:             bun ${Bun.version}`);

console.log(`Routes/app:          ${ROUTES.toLocaleString()}`);

console.log(
  `Installed plugins:   ${INSTALLED_PLUGIN_COUNT} on candidate request app`,
);

console.log(`Request samples:     ${REQUEST_SAMPLES}`);

console.log(
  `Request iterations:  ${REQUEST_ITERATIONS.toLocaleString()} / side / sample`,
);

console.log(`Install samples:     ${INSTALL_SAMPLES}`);

console.log();

console.log("Request zero-overhead results");

console.table(
  requestSummaries.map((summary) => ({
    case: summary.case,

    "control ns": round(summary.controlMedian, 2),

    "candidate ns": round(summary.candidateMedian, 2),

    "delta ns": signed(summary.deltaMedian, 2),

    "delta %": signed(summary.deltaPercentMedian, 2),

    "control cv %": round(summary.controlCv, 2),

    "candidate cv %": round(summary.candidateCv, 2),

    wins: `${summary.candidateWins}/${summary.samples}`,

    "control-first %": signed(summary.controlFirstDeltaPercent, 2),

    "candidate-first %": signed(summary.candidateFirstDeltaPercent, 2),
  })),
);

console.log("\nInstallation diagnostics");

console.table(
  installSummaries.map((summary) => ({
    case: summary.case,

    plugins: summary.plugins,

    "total ms": round(summary.medianTotalNs / 1_000_000, 3),

    "ns/plugin": round(summary.medianNsPerPlugin, 2),

    "cv %": round(summary.cvPercent, 2),

    samples: summary.samples,
  })),
);

console.log("\nP8-B3-B frozen request gates");

console.table(requestGateRows);

console.log("\nP8-B3-B frozen installation gates");

console.table(installGateRows);

console.log(
  `\nPre-frozen recommendation: ${
    requestPass && installPass ? "accept-b3-b" : "reject-b3-b"
  }`,
);

console.log(`Numeric sink: ${numericSink}`);

function installRepresentativePlugins(app: Gelis, count: number): void {
  const capabilities: Capability<number>[] = [];

  for (let index = 0; index < count; index++) {
    const capability: Capability<number> = defineCapability(
      `request-app-cap-${index}`,
    );

    capabilities.push(capability);

    const previous = capabilities[index - 1];

    const plugin = definePlugin(
      `request-app-plugin-${index}`,

      (context) => {
        let value = index;

        if (previous !== undefined) {
          value ^= previous.require(context);
        }

        capability.provide(context, value);
      },
    );

    app.use(plugin);
  }
}

function registerRequestRoutes(app: Gelis): void {
  for (let index = 0; index < ROUTES; index++) {
    if (index % 2 === 0) {
      const path = `/plain/${index}` as const;

      app.get(
        path,

        () => sharedResponse,
      );

      continue;
    }

    const path = `/dynamic/${index}/:id` as const;

    app.get(
      path,

      ({ params }) => {
        numericSink ^= params.id!.length + index;

        return sharedResponse;
      },
    );
  }
}

function assertRequestCorrectness(): void {
  for (const request of [requests.plainStatic, requests.dynamicRaw]) {
    const control = controlApp.fetch(request);

    const candidate = candidateApp.fetch(request);

    if (control instanceof Promise || candidate instanceof Promise) {
      throw new Error(
        "Unexpected async result during P8-B3-B correctness check",
      );
    }

    if (control.status !== 204 || candidate.status !== 204) {
      throw new Error("Unexpected status during P8-B3-B correctness check");
    }
  }
}

function createFetchRunner(app: Gelis, request: Request): Runner {
  return (iterations) => {
    let local = 0;

    for (let index = 0; index < iterations; index++) {
      const result = app.fetch(request);

      if (result instanceof Promise) {
        throw new Error("Unexpected async request result in P8-B3-B");
      }

      local ^= result.status;
    }

    numericSink ^= local;

    return local;
  };
}

function runRequestPaired(
  control: Runner,
  candidate: Runner,
  pairIndex: number,
): RequestSample[] {
  const samples: RequestSample[] = [];

  for (let sampleIndex = 0; sampleIndex < REQUEST_SAMPLES; sampleIndex++) {
    numericSink ^= sampleIndex + pairIndex * 131;

    const controlFirst = sampleIndex % 2 === 0;

    let controlNs: number;

    let candidateNs: number;

    if (controlFirst) {
      Bun.gc(true);

      controlNs = measureRequest(control);

      Bun.gc(true);

      candidateNs = measureRequest(candidate);
    } else {
      Bun.gc(true);

      candidateNs = measureRequest(candidate);

      Bun.gc(true);

      controlNs = measureRequest(control);
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

function measureRequest(runner: Runner): number {
  const start = Bun.nanoseconds();

  runner(REQUEST_ITERATIONS);

  return (Bun.nanoseconds() - start) / REQUEST_ITERATIONS;
}

function summarizeRequest(
  name: string,
  samples: readonly RequestSample[],
): RequestSummary {
  const controlValues = samples.map((sample) => sample.control);

  const candidateValues = samples.map((sample) => sample.candidate);

  const controlFirst = samples.filter((sample) => sample.controlFirst);

  const candidateFirst = samples.filter((sample) => !sample.controlFirst);

  return {
    case: name,

    controlMedian: median(controlValues),

    candidateMedian: median(candidateValues),

    deltaMedian: median(samples.map((sample) => sample.delta)),

    deltaPercentMedian: median(samples.map((sample) => sample.deltaPercent)),

    controlCv: cv(controlValues),

    candidateCv: cv(candidateValues),

    candidateWins: samples.filter((sample) => sample.candidate < sample.control)
      .length,

    samples: samples.length,

    controlFirstDeltaPercent: median(
      controlFirst.map((sample) => sample.deltaPercent),
    ),

    candidateFirstDeltaPercent: median(
      candidateFirst.map((sample) => sample.deltaPercent),
    ),
  };
}

function createNoopPlugins(count: number): Plugin[] {
  const plugins: Plugin[] = [];

  for (let index = 0; index < count; index++) {
    plugins.push(
      definePlugin(
        `noop-${index}`,

        () => {
          numericSink ^= index & 1;
        },
      ),
    );
  }

  return plugins;
}

function createCapabilityChainPlugins(count: number): Plugin[] {
  const plugins: Plugin[] = [];

  const capabilities: Capability<number>[] = [];

  for (let index = 0; index < count; index++) {
    const capability: Capability<number> = defineCapability(
      `install-cap-${index}`,
    );

    capabilities.push(capability);

    const previous = capabilities[index - 1];

    plugins.push(
      definePlugin(
        `capability-plugin-${index}`,

        (context) => {
          let value = index;

          if (previous !== undefined) {
            value ^= previous.require(context);
          }

          capability.provide(context, value);

          numericSink ^= value & 1;
        },
      ),
    );
  }

  return plugins;
}

function runInstall(plugins: readonly Plugin[], count: number): void {
  const app = new Gelis();

  for (let index = 0; index < count; index++) {
    app.use(plugins[index]!);
  }

  numericSink ^= count;
}

function measureInstallCase(
  name: string,
  plugins: readonly Plugin[],
  count: (typeof INSTALL_SIZES)[number],
): InstallSummary {
  const totalSamples: number[] = [];

  const perPluginSamples: number[] = [];

  for (let sample = 0; sample < INSTALL_SAMPLES; sample++) {
    Bun.gc(true);

    const start = Bun.nanoseconds();

    runInstall(plugins, count);

    const total = Bun.nanoseconds() - start;

    totalSamples.push(total);

    perPluginSamples.push(total / count);
  }

  return {
    case: name,

    plugins: count,

    medianTotalNs: median(totalSamples),

    medianNsPerPlugin: median(perPluginSamples),

    cvPercent: cv(perPluginSamples),

    samples: INSTALL_SAMPLES,
  };
}

function requiredInstallSummary(
  summaries: readonly InstallSummary[],
  name: string,
  plugins: number,
): InstallSummary {
  const summary = summaries.find(
    (candidate) => candidate.case === name && candidate.plugins === plugins,
  );

  if (summary === undefined) {
    throw new Error(`Missing install summary: ${name}-${plugins}`);
  }

  return summary;
}

function cv(values: readonly number[]): number {
  const mean =
    values.reduce((total, value) => total + value, 0) / values.length;

  const variance =
    values.reduce((total, value) => {
      const delta = value - mean;

      return total + delta * delta;
    }, 0) / values.length;

  return (Math.sqrt(variance) / mean) * 100;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle]!;
  }

  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function signed(value: number, digits: number): string {
  const rounded = round(value, digits);

  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

import {
  normalizeResponse,
  normalizeResponseWithStatus,
} from "../../../src/runtime/response";

const WARMUP = 20_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;

const STATIC_PAYLOAD = { method: "GET", route: 4_999 } as const;
const DYNAMIC_PAYLOAD = { method: "GET", id: "value-42" } as const;

const STATUS_200_INIT = { status: 200 } as const;
const TEXT_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
} as const;

type PayloadKind = "static" | "dynamic";

type Strategy =
  | "response-json-default"
  | "response-json-empty-init"
  | "response-json-status200-inline"
  | "response-json-status200-shared"
  | "normalize-with-status200"
  | "normalize-current"
  | "candidate-success";

type Cell = `${PayloadKind}::${Strategy}`;
type Operation = () => number;

interface WorkerResult {
  readonly cell: Cell;
  readonly probeOnly: boolean;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number | null;
  readonly sink: number;
}

interface ResponseSnapshot {
  readonly status: number;
  readonly body: string;
  readonly mediaType: string;
}

const PAYLOAD_KINDS = new Set<PayloadKind>(["static", "dynamic"]);
const STRATEGIES = new Set<Strategy>([
  "response-json-default",
  "response-json-empty-init",
  "response-json-status200-inline",
  "response-json-status200-shared",
  "normalize-with-status200",
  "normalize-current",
  "candidate-success",
]);

const args = readArgs(process.argv.slice(2));
const requestedCell = required(args.cell, "--cell");
assertCell(requestedCell);
const cell = requestedCell;
const probeOnly = args.probeOnly === "true";

const prepared = prepareCell(cell);
await prepared.assertCorrectness();

if (probeOnly) {
  const result: WorkerResult = {
    cell,
    probeOnly: true,
    iterations: 0,
    warmups: 0,
    nsPerOp: null,
    sink: 0,
  };

  console.log(JSON.stringify(result));
} else {
  let sink = 0;

  const operation = () => {
    const value = prepared.operation();
    sink = ((sink << 5) - sink + value) | 0;
  };

  for (let index = 0; index < WARMUP; index++) operation();

  const iterations = calibrate(operation);
  const elapsed = measure(operation, iterations);

  const result: WorkerResult = {
    cell,
    probeOnly: false,
    iterations,
    warmups: WARMUP,
    nsPerOp: (elapsed * 1_000_000) / iterations,
    sink,
  };

  console.log(JSON.stringify(result));
}

function prepareCell(cell: Cell): {
  readonly operation: Operation;
  readonly assertCorrectness: () => Promise<void>;
} {
  const [payloadKind, strategy] = cell.split("::") as [PayloadKind, Strategy];
  const payload = payloadKind === "static" ? STATIC_PAYLOAD : DYNAMIC_PAYLOAD;
  const expectedBody = JSON.stringify(payload);

  const factory = (): Response => {
    switch (strategy) {
      case "response-json-default":
        return Response.json(payload);

      case "response-json-empty-init":
        return Response.json(payload, {});

      case "response-json-status200-inline":
        return Response.json(payload, { status: 200 });

      case "response-json-status200-shared":
        return Response.json(payload, STATUS_200_INIT);

      case "normalize-with-status200":
        return normalizeResponseWithStatus(200, payload);

      case "normalize-current":
        return normalizeResponse(payload);

      case "candidate-success":
        return normalizeOrdinarySuccess(payload);
    }
  };

  return {
    operation: () => consumeResponse(factory()),
    assertCorrectness: async () => {
      assertJsonResponse(await responseSnapshot(factory()), expectedBody, cell);

      if (strategy === "candidate-success") {
        await assertCandidateOrdinarySemantics();
      }
    },
  };
}

function normalizeOrdinarySuccess(value: unknown): Response {
  if (value instanceof Response) {
    return value;
  }

  if (value === undefined) {
    return new Response(null, {
      status: 204,
    });
  }

  if (typeof value === "string") {
    return new Response(value, {
      headers: TEXT_HEADERS,
    });
  }

  return Response.json(value);
}

async function assertCandidateOrdinarySemantics(): Promise<void> {
  const existing = new Response("raw");
  if (normalizeOrdinarySuccess(existing) !== existing) {
    throw new Error("candidate did not preserve Response identity");
  }

  const empty = normalizeOrdinarySuccess(undefined);
  if (empty.status !== 204 || (await empty.text()) !== "") {
    throw new Error("candidate undefined semantics differ from production");
  }

  const text = normalizeOrdinarySuccess("hello");
  const textSnapshot = await responseSnapshot(text);
  if (
    textSnapshot.status !== 200 ||
    textSnapshot.body !== "hello" ||
    textSnapshot.mediaType !== "text/plain"
  ) {
    throw new Error("candidate string semantics differ from production");
  }
}

function consumeResponse(response: Response): number {
  return response.status + (response.headers.get("content-type")?.length ?? 0);
}

async function responseSnapshot(response: Response): Promise<ResponseSnapshot> {
  return {
    status: response.status,
    body: await response.text(),
    mediaType: mediaType(response),
  };
}

function assertJsonResponse(
  snapshot: ResponseSnapshot,
  expectedBody: string,
  label: string,
): void {
  if (snapshot.status !== 200) {
    throw new Error(`${label} status mismatch: ${snapshot.status}`);
  }

  if (snapshot.body !== expectedBody) {
    throw new Error(
      `${label} body mismatch: expected ${expectedBody}, got ${snapshot.body}`,
    );
  }

  if (snapshot.mediaType !== "application/json") {
    throw new Error(`${label} media type mismatch: ${snapshot.mediaType}`);
  }
}

function mediaType(response: Response): string {
  return (
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() ?? ""
  );
}

function calibrate(operation: () => void): number {
  let iterations = 1_000;

  while (true) {
    const elapsed = measure(operation, iterations);

    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
      );
    }

    iterations *= 2;
  }
}

function measure(operation: () => void, iterations: number): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) operation();

  return performance.now() - start;
}

function readArgs(argv: readonly string[]): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const argument of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(argument);
    if (match === null) continue;

    const key = match[1];
    const value = match[2];
    if (key !== undefined && value !== undefined) parsed[key] = value;
  }

  return parsed;
}

function required(value: string | undefined, label: string): string {
  if (value === undefined || value === "") {
    throw new Error(`Missing ${label}`);
  }

  return value;
}

function assertCell(value: string): asserts value is Cell {
  const [payloadKind, strategy, extra] = value.split("::");

  if (
    extra !== undefined ||
    !PAYLOAD_KINDS.has(payloadKind as PayloadKind) ||
    !STRATEGIES.has(strategy as Strategy)
  ) {
    throw new Error(`Unknown CP3-B cell: ${value}`);
  }
}

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = resolve(HERE, "generated");

const cases = [
  {
    name: "static-raw",
    path: "/r/1?probe=1",
    expectedBody: "GET",
    expectedMediaType: "text/plain",
  },
  {
    name: "dynamic-raw",
    path: "/r/1/value-42?probe=1",
    expectedBody: "value-42",
    expectedMediaType: "text/plain",
  },
  {
    name: "static-json",
    path: "/r/1?probe=1",
    expectedBody: JSON.stringify({ method: "GET", route: 1 }),
    expectedMediaType: "application/json",
  },
  {
    name: "dynamic-json",
    path: "/r/1/value-42?probe=1",
    expectedBody: JSON.stringify({ method: "GET", id: "value-42" }),
    expectedMediaType: "application/json",
  },
] as const;

const rows: Array<Record<string, string | number>> = [];
let port = 38200;

for (const benchmarkCase of cases) {
  const serverFile = resolve(GENERATED_DIR, benchmarkCase.name, "server.js");
  const child = Bun.spawn({
    cmd: [process.execPath, serverFile],
    cwd: HERE,
    env: {
      ...process.env,
      PORT: String(port),
      ROUTES: "3",
      ROUTE_KIND: benchmarkCase.name.startsWith("static")
        ? "static"
        : "dynamic",
      BODY_KIND: benchmarkCase.name.endsWith("raw") ? "raw" : "json",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const url = `http://127.0.0.1:${port}${benchmarkCase.path}`;
  port++;

  try {
    const response = await waitForResponse(url, child);
    const body = await response.text();
    const mediaType =
      response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase() ?? "";

    assertEqual(response.status, 200, `${benchmarkCase.name} status`);
    assertEqual(body, benchmarkCase.expectedBody, `${benchmarkCase.name} body`);
    assertEqual(
      mediaType,
      benchmarkCase.expectedMediaType,
      `${benchmarkCase.name} content-type`,
    );

    if (response.headers.get("content-encoding") !== null) {
      throw new Error(
        `${benchmarkCase.name} unexpectedly applied content encoding`,
      );
    }

    rows.push({
      framework: "elysia-next-aot",
      case: benchmarkCase.name,
      status: response.status,
      "content-type": mediaType,
      body,
    });
  } finally {
    child.kill();
    await child.exited;
  }
}

console.log("CP1-A2 Elysia 2 AOT equivalence");
console.table(rows);
console.log("CP1-A2 ELYSIA 2 AOT EQUIVALENCE: PASS");

async function waitForResponse(
  url: string,
  child: ReturnType<typeof Bun.spawn>,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) {
      const stderr = await streamText(child.stderr);
      throw new Error(
        `AOT server exited before readiness with code ${child.exitCode}: ${stderr}`,
      );
    }

    try {
      return await fetch(url, { headers: { accept: "*/*" } });
    } catch (error) {
      lastError = error;
      await Bun.sleep(25);
    }
  }

  throw new Error(
    `AOT server did not become ready for ${url}: ${String(lastError)}`,
  );
}

async function streamText(
  stream: number | ReadableStream<Uint8Array> | undefined,
): Promise<string> {
  if (!(stream instanceof ReadableStream)) {
    return "";
  }

  return await new Response(stream).text();
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

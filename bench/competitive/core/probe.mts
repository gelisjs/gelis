import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "../..");

const GELIS_SOURCE_SHA = "1dd5f94cf0e9ad884ca44e537ee287587cd8baab";
const EXPECTED_BUN = "1.4.2";
const EXPECTED_HONO = "4.13.7";
const EXPECTED_ELYSIA_STABLE = "1.4.30";
const EXPECTED_ELYSIA_NEXT = "2.0.0-beta.14";
const ROUTES = 3;

interface FrameworkCase {
  readonly name: string;
  readonly file: string;
  readonly env?: Readonly<Record<string, string>>;
}

interface RouteCase {
  readonly name: string;
  readonly routeKind: "static" | "dynamic";
  readonly bodyKind: "raw" | "json";
  readonly path: string;
  readonly expectedBody: string;
  readonly expectedMediaType: "text/plain" | "application/json";
}

const frameworks: readonly FrameworkCase[] = [
  {
    name: "raw-bun",
    file: resolve(HERE, "servers/raw-bun.ts"),
  },
  {
    name: "gelis",
    file: resolve(HERE, "servers/gelis.ts"),
  },
  {
    name: "hono",
    file: resolve(HERE, "servers/hono.ts"),
  },
  {
    name: "elysia-stable",
    file: resolve(HERE, "servers/elysia-stable.ts"),
    env: { PRECOMPILE: "false" },
  },
  {
    name: "elysia-stable-precompile",
    file: resolve(HERE, "servers/elysia-stable.ts"),
    env: { PRECOMPILE: "true" },
  },
  {
    name: "elysia-next",
    file: resolve(HERE, "servers/elysia-next.ts"),
  },
];

const cases: readonly RouteCase[] = [
  {
    name: "static-raw",
    routeKind: "static",
    bodyKind: "raw",
    path: "/r/1?probe=1",
    expectedBody: "GET",
    expectedMediaType: "text/plain",
  },
  {
    name: "dynamic-raw",
    routeKind: "dynamic",
    bodyKind: "raw",
    path: "/r/1/value-42?probe=1",
    expectedBody: "value-42",
    expectedMediaType: "text/plain",
  },
  {
    name: "static-json",
    routeKind: "static",
    bodyKind: "json",
    path: "/r/1?probe=1",
    expectedBody: JSON.stringify({ method: "GET", route: 1 }),
    expectedMediaType: "application/json",
  },
  {
    name: "dynamic-json",
    routeKind: "dynamic",
    bodyKind: "json",
    path: "/r/1/value-42?probe=1",
    expectedBody: JSON.stringify({ method: "GET", id: "value-42" }),
    expectedMediaType: "application/json",
  },
];

assertEnvironment();

const rows: Array<Record<string, string | number>> = [];
let nextPort = 38100;

for (const routeCase of cases) {
  for (const framework of frameworks) {
    const port = nextPort++;
    const result = await probeFramework(framework, routeCase, port);

    rows.push({
      framework: framework.name,
      case: routeCase.name,
      status: result.status,
      "content-type": result.mediaType,
      body: result.body,
    });
  }
}

console.log("CP1-A core HTTP equivalence");
console.log(`Bun:         ${Bun.version}`);
console.log(`Gelis source:${GELIS_SOURCE_SHA}`);
console.log(`Hono:        ${EXPECTED_HONO}`);
console.log(`Elysia:      ${EXPECTED_ELYSIA_STABLE}`);
console.log(`Elysia next: ${EXPECTED_ELYSIA_NEXT}`);
console.table(rows);
console.log("CP1-A CORE EQUIVALENCE: PASS");

function assertEnvironment(): void {
  assertEqual(Bun.version, EXPECTED_BUN, "Bun version");
  assertEqual(packageVersion("hono"), EXPECTED_HONO, "Hono version");
  assertEqual(
    packageVersion("elysia"),
    EXPECTED_ELYSIA_STABLE,
    "Elysia stable version",
  );
  assertEqual(
    packageVersion("elysia-v2"),
    EXPECTED_ELYSIA_NEXT,
    "Elysia next version",
  );

  const sourceDiff = Bun.spawnSync({
    cmd: ["git", "diff", "--quiet", GELIS_SOURCE_SHA, "--", "src"],
    cwd: REPO_ROOT,
    stdout: "ignore",
    stderr: "pipe",
  });

  if (sourceDiff.exitCode !== 0) {
    throw new Error(
      `Gelis src differs from frozen production candidate ${GELIS_SOURCE_SHA}`,
    );
  }
}

function packageVersion(packageName: string): string {
  const packageFile = resolve(
    PACKAGE_ROOT,
    "node_modules",
    packageName,
    "package.json",
  );
  const parsed = JSON.parse(readFileSync(packageFile, "utf8")) as {
    version?: unknown;
  };

  if (typeof parsed.version !== "string") {
    throw new Error(`Missing version in ${packageFile}`);
  }

  return parsed.version;
}

async function probeFramework(
  framework: FrameworkCase,
  routeCase: RouteCase,
  port: number,
): Promise<{
  status: number;
  body: string;
  mediaType: string;
}> {
  const process = Bun.spawn({
    cmd: [processExecPath(), framework.file],
    cwd: PACKAGE_ROOT,
    env: {
      ...processEnv(),
      PORT: String(port),
      ROUTES: String(ROUTES),
      ROUTE_KIND: routeCase.routeKind,
      BODY_KIND: routeCase.bodyKind,
      ...framework.env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const url = `http://127.0.0.1:${port}${routeCase.path}`;

  try {
    const response = await waitForResponse(url, process);
    const body = await response.text();
    const contentType = response.headers.get("content-type");
    const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";

    assertEqual(response.status, 200, `${framework.name}/${routeCase.name} status`);
    assertEqual(body, routeCase.expectedBody, `${framework.name}/${routeCase.name} body`);
    assertEqual(
      mediaType,
      routeCase.expectedMediaType,
      `${framework.name}/${routeCase.name} content-type`,
    );

    if (response.headers.get("content-encoding") !== null) {
      throw new Error(
        `${framework.name}/${routeCase.name} unexpectedly applied content encoding`,
      );
    }

    return {
      status: response.status,
      body,
      mediaType,
    };
  } finally {
    process.kill();
    await process.exited;
  }
}

async function waitForResponse(
  url: string,
  child: ReturnType<typeof Bun.spawn>,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) {
      const stderr = await streamText(child.stderr);
      throw new Error(
        `Server exited before readiness with code ${child.exitCode}: ${stderr}`,
      );
    }

    try {
      return await fetch(url, {
        headers: {
          accept: "*/*",
        },
      });
    } catch (error) {
      lastError = error;
      await Bun.sleep(25);
    }
  }

  throw new Error(`Server did not become ready for ${url}: ${String(lastError)}`);
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

function processExecPath(): string {
  return process.execPath;
}

function processEnv(): NodeJS.ProcessEnv {
  return process.env;
}

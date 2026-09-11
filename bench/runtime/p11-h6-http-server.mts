import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Hono } from "hono";
import { cors as honoCors } from "hono/cors";
import { requestId as honoRequestId } from "hono/request-id";
import { secureHeaders as honoSecureHeaders } from "hono/secure-headers";
import { timeout as honoTimeout } from "hono/timeout";

const ORIGIN = "https://client.test";
const FIXED_REQUEST_ID = "req_p11_h6_fixed";
const TIMEOUT_MS = 60_000;

type Framework = "gelis" | "hono";

interface BenchmarkGelisApp {
  use(plugin: unknown): unknown;
  get(path: string, handler: () => unknown): unknown;
  fetch(request: Request): Response | Promise<Response>;
}

const framework = required(process.env.FRAMEWORK, "FRAMEWORK") as Framework;
const candidateRoot = required(process.env.CANDIDATE_ROOT, "CANDIDATE_ROOT");
const port = Number(process.env.PORT ?? 3106);

if (framework !== "gelis" && framework !== "hono") {
  throw new Error(`Unknown HTTP benchmark framework: ${framework}`);
}

if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
  throw new Error(`Invalid benchmark PORT: ${String(process.env.PORT)}`);
}

if (framework === "gelis") {
  await startGelis(candidateRoot, port);
} else {
  startHono(port);
}

async function startGelis(root: string, serverPort: number): Promise<void> {
  const coreUrl = pathToFileURL(resolve(root, "src/index.ts")).href;
  const corsUrl = pathToFileURL(resolve(root, "src/cors/index.ts")).href;
  const secureHeadersUrl = pathToFileURL(
    resolve(root, "src/secure-headers/index.ts"),
  ).href;
  const requestIdUrl = pathToFileURL(
    resolve(root, "src/request-id/index.ts"),
  ).href;
  const timeoutUrl = pathToFileURL(
    resolve(root, "src/timeout/index.ts"),
  ).href;
  const bunAdapterUrl = pathToFileURL(
    resolve(root, "src/adapter/bun/index.ts"),
  ).href;

  const [
    coreModule,
    corsModule,
    secureHeadersModule,
    requestIdModule,
    timeoutModule,
    bunAdapterModule,
  ] = await Promise.all([
    import(coreUrl) as Promise<{ Gelis: new () => BenchmarkGelisApp }>,
    import(corsUrl) as Promise<{
      cors: (options?: Record<string, unknown>) => unknown;
    }>,
    import(secureHeadersUrl) as Promise<{
      secureHeaders: (options?: Record<string, unknown>) => unknown;
    }>,
    import(requestIdUrl) as Promise<{
      requestId: (options?: Record<string, unknown>) => unknown;
    }>,
    import(timeoutUrl) as Promise<{
      timeout: (options?: { readonly duration?: number }) => unknown;
    }>,
    import(bunAdapterUrl) as Promise<{
      serve: (
        app: BenchmarkGelisApp,
        options: {
          readonly port: number;
          readonly hostname: string;
          readonly reusePort: boolean;
        },
      ) => unknown;
    }>,
  ]);

  const app = new coreModule.Gelis();

  app.use(corsModule.cors({ origin: ORIGIN }));
  app.use(secureHeadersModule.secureHeaders());
  app.use(
    requestIdModule.requestId({
      generator: () => FIXED_REQUEST_ID,
    }),
  );
  app.use(timeoutModule.timeout({ duration: TIMEOUT_MS }));
  app.get("/resource", () => new Response(null, { status: 204 }));

  bunAdapterModule.serve(app, {
    port: serverPort,
    hostname: "127.0.0.1",
    reusePort: false,
  });
}

function startHono(serverPort: number): void {
  const app = new Hono<{ Variables: { requestId: string } }>();

  app.use("*", honoCors({ origin: ORIGIN }));
  app.use("*", honoSecureHeaders(honoSecureHeadersOptions()));
  app.use(
    "*",
    honoRequestId({
      generator: () => FIXED_REQUEST_ID,
    }),
  );
  app.use("*", honoTimeout(TIMEOUT_MS));
  app.get("/resource", (context) => context.body(null, 204));

  Bun.serve({
    port: serverPort,
    hostname: "127.0.0.1",
    reusePort: false,
    fetch: app.fetch,
  });
}

function honoSecureHeadersOptions() {
  return {
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
    referrerPolicy: "no-referrer",
    strictTransportSecurity: "max-age=31536000",
    xContentTypeOptions: "nosniff",
    xDnsPrefetchControl: false,
    xDownloadOptions: false,
    xFrameOptions: "SAMEORIGIN",
    xPermittedCrossDomainPolicies: false,
    xXssProtection: "0",
    removePoweredBy: true,
    permissionsPolicy: {},
  } as const;
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

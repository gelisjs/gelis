import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface BenchmarkGelisApp {
  use(plugin: unknown): unknown;
  get(path: string, handler: () => unknown): unknown;
  fetch(request: Request): Response | Promise<Response>;
}

type Framework = "gelis" | "hono";

const framework = required(process.env.FRAMEWORK, "FRAMEWORK") as Framework;
const candidateRoot = required(process.env.CANDIDATE_ROOT, "CANDIDATE_ROOT");
const port = Number(process.env.PORT ?? 3100);

if (framework !== "gelis" && framework !== "hono") {
  throw new Error(`Unknown HTTP benchmark framework: ${framework}`);
}

if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
  throw new Error(`Invalid benchmark PORT: ${String(process.env.PORT)}`);
}

if (framework === "gelis") {
  await startGelis(candidateRoot, port);
} else {
  await startHono(port);
}

async function startGelis(root: string, serverPort: number): Promise<void> {
  const coreUrl = pathToFileURL(resolve(root, "src/index.ts")).href;
  const secureHeadersUrl = pathToFileURL(
    resolve(root, "src/secure-headers/index.ts"),
  ).href;
  const bunAdapterUrl = pathToFileURL(
    resolve(root, "src/adapter/bun/index.ts"),
  ).href;

  const [coreModule, secureHeadersModule, bunAdapterModule] = await Promise.all(
    [
      import(coreUrl) as Promise<{
        Gelis: new () => BenchmarkGelisApp;
      }>,
      import(secureHeadersUrl) as Promise<{
        secureHeaders: () => unknown;
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
    ],
  );

  const app = new coreModule.Gelis();
  app.use(secureHeadersModule.secureHeaders());
  app.get("/resource", () => new Response(null, { status: 204 }));

  bunAdapterModule.serve(app, {
    port: serverPort,
    hostname: "127.0.0.1",
    reusePort: false,
  });
}

async function startHono(serverPort: number): Promise<void> {
  const [{ Hono }, { secureHeaders }] = await Promise.all([
    import("hono"),
    import("hono/secure-headers"),
  ]);

  const app = new Hono();
  app.use(
    "*",
    secureHeaders({
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
    }),
  );
  app.get("/resource", () => new Response(null, { status: 204 }));

  Bun.serve({
    port: serverPort,
    hostname: "127.0.0.1",
    reusePort: false,
    fetch: app.fetch,
  });
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Hono } from "hono";
import { timeout as honoTimeout } from "hono/timeout";

const HTTP_TIMEOUT_MS = 60_000;

type Framework = "gelis" | "hono";

interface BenchmarkGelisApp {
  use(plugin: unknown): unknown;
  get(path: string, handler: () => unknown): unknown;
  fetch(request: Request): Response | Promise<Response>;
}

const framework = required(process.env.FRAMEWORK, "FRAMEWORK") as Framework;
const candidateRoot = required(process.env.CANDIDATE_ROOT, "CANDIDATE_ROOT");
const port = Number(process.env.PORT ?? 3102);

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
  const timeoutUrl = pathToFileURL(resolve(root, "src/timeout/index.ts")).href;
  const bunAdapterUrl = pathToFileURL(
    resolve(root, "src/adapter/bun/index.ts"),
  ).href;

  const [coreModule, timeoutModule, bunAdapterModule] = await Promise.all([
    import(coreUrl) as Promise<{
      Gelis: new () => BenchmarkGelisApp;
    }>,
    import(timeoutUrl) as Promise<{
      timeout: (options: { readonly duration: number }) => unknown;
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
  app.use(timeoutModule.timeout({ duration: HTTP_TIMEOUT_MS }));
  app.get("/resource", () => new Response(null, { status: 204 }));

  bunAdapterModule.serve(app, {
    port: serverPort,
    hostname: "127.0.0.1",
    reusePort: false,
  });
}

function startHono(serverPort: number): void {
  const app = new Hono();

  app.use("*", honoTimeout(HTTP_TIMEOUT_MS));
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

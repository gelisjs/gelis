import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Hono } from "hono";
import { requestId as honoRequestId } from "hono/request-id";

interface BenchmarkGelisApp {
  use(plugin: unknown): unknown;
  get(
    path: string,
    handler: (context: { readonly request: Request }) => unknown,
  ): unknown;
  fetch(request: Request): Response | Promise<Response>;
}

type Framework = "gelis" | "hono";

const framework = required(process.env.FRAMEWORK, "FRAMEWORK") as Framework;
const candidateRoot = required(process.env.CANDIDATE_ROOT, "CANDIDATE_ROOT");
const port = Number(process.env.PORT ?? 3101);

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
  const requestIdUrl = pathToFileURL(
    resolve(root, "src/request-id/index.ts"),
  ).href;
  const bunAdapterUrl = pathToFileURL(
    resolve(root, "src/adapter/bun/index.ts"),
  ).href;

  const [coreModule, requestIdModule, bunAdapterModule] = await Promise.all([
    import(coreUrl) as Promise<{
      Gelis: new () => BenchmarkGelisApp;
    }>,
    import(requestIdUrl) as Promise<{
      requestId: () => {
        get(request: Request): string | undefined;
      };
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
  const ids = requestIdModule.requestId();

  app.use(ids);
  app.get("/resource", ({ request }) => {
    const observed = ids.get(request);
    if (observed === undefined) {
      throw new Error("Missing Gelis request ID");
    }

    return new Response(null, {
      status: 204,
      headers: {
        "X-Observed-Request-Id": observed,
      },
    });
  });

  bunAdapterModule.serve(app, {
    port: serverPort,
    hostname: "127.0.0.1",
    reusePort: false,
  });
}

function startHono(serverPort: number): void {
  const app = new Hono<{ Variables: { requestId: string } }>();

  app.use("*", honoRequestId());
  app.get("/resource", (context) => {
    const observed = context.get("requestId");

    context.header("X-Observed-Request-Id", observed);
    return context.body(null, 204);
  });

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

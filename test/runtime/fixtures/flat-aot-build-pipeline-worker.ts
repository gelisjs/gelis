import { pathToFileURL } from "node:url";

interface FetchApplication {
  fetch(request: Request): Response | Promise<Response>;
}

interface WorkerRequest {
  readonly path: string;

  readonly method?: string;
}

interface RequestResult {
  readonly path: string;

  readonly status: number;

  readonly body: string;
}

const modulePath = process.env.MODULE_PATH;

const pathsJson = process.env.REQUEST_PATHS;

const requestsJson = process.env.REQUESTS_JSON;

if (
  modulePath === undefined ||
  (pathsJson === undefined && requestsJson === undefined)
) {
  throw new Error("Missing E5E worker environment");
}

const requests: WorkerRequest[] =
  requestsJson !== undefined
    ? (JSON.parse(requestsJson) as WorkerRequest[])
    : (JSON.parse(pathsJson!) as string[]).map((path) => ({
        path,
      }));

const loaded = (await import(pathToFileURL(modulePath).href)) as {
  readonly default?: FetchApplication;
};

const app = loaded.default;

if (app === undefined || typeof app.fetch !== "function") {
  throw new Error(
    "Generated E5E module did not export a valid Gelis application",
  );
}

const results: RequestResult[] = [];

for (const request of requests) {
  const response = await app.fetch(
    new Request(`http://gelis.test${request.path}`, {
      method: request.method ?? "GET",
    }),
  );

  results.push({
    path: request.path,

    status: response.status,

    body: await response.text(),
  });
}

console.log(JSON.stringify(results));

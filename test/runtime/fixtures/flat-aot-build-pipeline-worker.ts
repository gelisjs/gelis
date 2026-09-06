import { pathToFileURL } from "node:url";

interface FetchApplication {
  fetch(request: Request): Response | Promise<Response>;
}

interface RequestResult {
  readonly path: string;

  readonly status: number;

  readonly body: string;
}

const modulePath = process.env.MODULE_PATH;

const pathsJson = process.env.REQUEST_PATHS;

if (modulePath === undefined || pathsJson === undefined) {
  throw new Error("Missing E5E worker environment");
}

const paths = JSON.parse(pathsJson) as string[];

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

for (const path of paths) {
  const response = await app.fetch(new Request(`http://gelis.test${path}`));

  results.push({
    path,

    status: response.status,

    body: await response.text(),
  });
}

console.log(JSON.stringify(results));

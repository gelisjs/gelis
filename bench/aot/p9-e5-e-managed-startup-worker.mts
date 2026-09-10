import { pathToFileURL } from "node:url";

const modulePath = process.env.MODULE_PATH;
const scenario = process.env.SCENARIO;

if (modulePath === undefined || scenario === undefined) {
  throw new Error("Missing P9-E5-E managed startup worker environment");
}

const readyStarted = performance.now();
const loaded = await import(pathToFileURL(modulePath).href);
const readyMs = performance.now() - readyStarted;

const app = loaded.default as
  | {
      fetch(request: Request): Response | Promise<Response>;
    }
  | undefined;

if (app === undefined || typeof app.fetch !== "function") {
  throw new Error("Managed startup module did not export a Gelis application");
}

const firstStarted = performance.now();
const response = await app.fetch(
  new Request("http://gelis.test/r/4999", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ value: "gelis" }),
  }),
);
const firstFetchUs = (performance.now() - firstStarted) * 1_000;

if (response.status !== 200) {
  throw new Error(
    `Unexpected managed startup response status: ${response.status}`,
  );
}

if ((await response.text()) !== "ok") {
  throw new Error("Unexpected managed startup response body");
}

console.log(
  JSON.stringify({
    scenario,
    readyMs,
    firstFetchUs,
    rssMb: process.memoryUsage().rss / (1024 * 1024),
  }),
);

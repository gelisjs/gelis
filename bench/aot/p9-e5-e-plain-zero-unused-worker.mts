import { pathToFileURL } from "node:url";

const modulePath = process.env.MODULE_PATH;
const targetPath = process.env.TARGET_PATH;
const expectedBody = process.env.EXPECTED_BODY;
const profile = process.env.PROFILE;
const scenario = process.env.SCENARIO;

if (
  modulePath === undefined ||
  targetPath === undefined ||
  expectedBody === undefined ||
  profile === undefined ||
  scenario === undefined
) {
  throw new Error("Missing P9-E5-E plain zero-unused worker environment");
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
  throw new Error("Generated P9-E5-E module did not export a Gelis application");
}

const firstStarted = performance.now();
const response = await app.fetch(new Request(`http://gelis.test${targetPath}`));
const firstFetchUs = (performance.now() - firstStarted) * 1_000;
const body = await response.text();

if (response.status !== 200) {
  throw new Error(`Unexpected first response status: ${response.status}`);
}

if (body !== expectedBody) {
  throw new Error(`Unexpected first response body: ${body}`);
}

const rssMb = process.memoryUsage().rss / (1024 * 1024);

console.log(
  JSON.stringify({
    profile,
    scenario,
    readyMs,
    firstFetchUs,
    rssMb,
  }),
);

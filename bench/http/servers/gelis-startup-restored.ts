import { definePlugin } from "../../../src";
import { serveReady } from "gelis/bun";

import { createBenchmarkApp } from "./gelis-app";

const PORT = Number(process.env.PORT ?? 3100);

const app = createBenchmarkApp();

app.use(
  definePlugin("startup-restored-http-benchmark", (setup) => {
    setup.startup(async () => {
      await Promise.resolve();
    });
  }),
);

const lifecycleServer = await serveReady(app, {
  port: PORT,
  hostname: "127.0.0.1",
  reusePort: false,
});

if (Object.prototype.hasOwnProperty.call(app, "fetch")) {
  await lifecycleServer.close(true);

  throw new Error(
    "startup-restored HTTP benchmark retained an own fetch wrapper",
  );
}

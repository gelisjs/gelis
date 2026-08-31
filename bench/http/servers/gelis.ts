import { createBenchmarkApp } from "./gelis-app";

const PORT = Number(process.env.PORT ?? 3100);

const app = createBenchmarkApp();

Bun.serve({
  port: PORT,

  hostname: "127.0.0.1",

  reusePort: false,

  fetch: app.fetch.bind(app),
});

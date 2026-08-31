import { serve } from "../../../prototype/bun";

import { createBenchmarkApp } from "./gelis-app";

const PORT = Number(process.env.PORT ?? 3100);

const app = createBenchmarkApp();

serve(app, {
  port: PORT,

  hostname: "127.0.0.1",

  reusePort: false,
});

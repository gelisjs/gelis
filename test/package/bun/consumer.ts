import { Gelis } from "gelis";
import { serve, serveReady } from "gelis/bun";

const app = new Gelis();

app.get("/", () => "bun");

const server: Bun.Server<undefined> = serve(app, {
  port: 3000,
});

void server;

async function start(): Promise<void> {
  const lifecycleServer = await serveReady(app, {
    port: 3000,
  });

  await lifecycleServer.close();
}

void start;

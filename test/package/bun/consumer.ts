import { Gelis } from "gelis";
import { serve, serveReady } from "gelis/bun";

import type { GelisBunLifecycleServer, GelisBunOptions } from "gelis/bun";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

type Expect<T extends true> = T;

type ServeApp = Expect<Equal<Parameters<typeof serve>[0], Gelis>>;

type ServeOptions = Expect<
  Equal<Parameters<typeof serve>[1], GelisBunOptions | undefined>
>;

type ServeReturn = Expect<
  Equal<ReturnType<typeof serve>, Bun.Server<undefined>>
>;

type ServeReadyApp = Expect<Equal<Parameters<typeof serveReady>[0], Gelis>>;

type ServeReadyOptions = Expect<
  Equal<Parameters<typeof serveReady>[1], GelisBunOptions | undefined>
>;

type ServeReadyReturn = Expect<
  Equal<ReturnType<typeof serveReady>, Promise<GelisBunLifecycleServer>>
>;

type LifecycleServer = Expect<
  Equal<GelisBunLifecycleServer["server"], Bun.Server<undefined>>
>;

type LifecycleClose = Expect<
  Equal<
    GelisBunLifecycleServer["close"],
    (closeActiveConnections?: boolean) => Promise<void>
  >
>;

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

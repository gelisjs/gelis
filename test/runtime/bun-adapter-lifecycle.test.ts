import { describe, expect, test } from "bun:test";

import { Gelis, definePlugin } from "../../src";

import { serve, serveReady } from "gelis/bun";

describe("Gelis Bun lifecycle adapter", () => {
  test("keeps plain serve synchronous and directly usable", async () => {
    const app = new Gelis();

    app.get("/health", () => "ok");

    const server = serve(app, {
      hostname: "127.0.0.1",

      port: 0,
    });

    expect(server).not.toBeInstanceOf(Promise);

    try {
      const response = await fetch(new URL("/health", server.url));

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ok");
    } finally {
      await server.stop(true);
    }
  });

  test("plain serve rejects pending startup without triggering it", () => {
    let startupCalls = 0;

    const app = new Gelis();

    app.use(
      definePlugin(
        "pending",

        (setup) => {
          setup.startup(() => {
            startupCalls++;
          });
        },
      ),
    );

    expect(() =>
      serve(app, {
        hostname: "127.0.0.1",

        port: 0,
      }),
    ).toThrow("use await serveReady(app, options)");

    expect(startupCalls).toBe(0);
  });

  test("serveReady does not open a listener before startup succeeds", async () => {
    const port = await acquireUnusedPort();

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    let startupCalls = 0;

    const app = new Gelis();

    app.get("/health", () => "ready");

    app.use(
      definePlugin(
        "delayed-startup",

        (setup) => {
          setup.startup(async () => {
            startupCalls++;

            await gate;
          });
        },
      ),
    );

    const pending = serveReady(app, {
      hostname: "127.0.0.1",

      port,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(startupCalls).toBe(1);

    /*
     * The same port must still be bindable while Gelis startup is pending.
     * This proves serveReady() has not called Bun.serve() yet.
     */
    const probe = Bun.serve({
      hostname: "127.0.0.1",

      port,

      fetch: () => new Response("probe"),
    });

    await probe.stop(true);

    release();

    const running = await pending;

    try {
      const response = await fetch(new URL("/health", running.server.url));

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ready");
    } finally {
      await running.close(true);
    }
  });

  test("serveReady rejects startup failure without leaving a listener", async () => {
    const port = await acquireUnusedPort();

    const failure = new Error("startup failed");

    const app = new Gelis();

    app.use(
      definePlugin(
        "failing-startup",

        (setup) => {
          setup.startup(() => {
            throw failure;
          });
        },
      ),
    );

    await expect(
      serveReady(app, {
        hostname: "127.0.0.1",

        port,
      }),
    ).rejects.toBe(failure);

    /*
     * Startup failed before Bun.serve(). The configured port must remain
     * available for another transport.
     */
    const probe = Bun.serve({
      hostname: "127.0.0.1",

      port,

      fetch: () => new Response("probe"),
    });

    await probe.stop(true);
  });

  test("lifecycle close stops Bun transport before application cleanup", async () => {
    const events: string[] = [];

    let serverUrl: URL | undefined;

    const app = new Gelis();

    app.get("/health", () => "ok");

    app.use(
      definePlugin(
        "resource",

        (setup) => {
          setup.startup((startup) => {
            events.push("startup");

            startup.cleanup(async () => {
              events.push("cleanup:begin");

              if (serverUrl === undefined) {
                throw new Error("Missing server URL");
              }

              let transportReachable = false;

              try {
                const response = await fetch(
                  serverUrl,

                  {
                    signal: AbortSignal.timeout(100),
                  },
                );

                await response.arrayBuffer();

                transportReachable = true;
              } catch {
                // Expected: Bun transport has already stopped.
              }

              expect(transportReachable).toBe(false);

              events.push("cleanup:end");
            });
          });
        },
      ),
    );

    const running = await serveReady(app, {
      hostname: "127.0.0.1",

      port: 0,
    });

    serverUrl = running.server.url;

    expect(events).toEqual(["startup"]);

    const firstClose = running.close(true);
    const secondClose = running.close(true);

    expect(secondClose).toBe(firstClose);

    await firstClose;

    expect(events).toEqual(["startup", "cleanup:begin", "cleanup:end"]);

    await expect(
      fetch(
        serverUrl,

        {
          signal: AbortSignal.timeout(100),
        },
      ),
    ).rejects.toBeDefined();

    await running.close(true);

    expect(events).toEqual(["startup", "cleanup:begin", "cleanup:end"]);
  });

  test("serve works after explicit readiness has completed", async () => {
    let startupCalls = 0;

    const app = new Gelis();

    app.get("/", () => "ok");

    app.use(
      definePlugin(
        "startup",

        (setup) => {
          setup.startup(() => {
            startupCalls++;
          });
        },
      ),
    );

    await app.ready();

    expect(startupCalls).toBe(1);

    const server = serve(app, {
      hostname: "127.0.0.1",

      port: 0,
    });

    try {
      const response = await fetch(server.url);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ok");
    } finally {
      await server.stop(true);

      await app.close();
    }
  });
});

async function acquireUnusedPort(): Promise<number> {
  const reservation = Bun.serve({
    hostname: "127.0.0.1",

    port: 0,

    fetch: () => new Response("reservation"),
  });

  const port = reservation.port;

  await reservation.stop(true);

  if (port === undefined) {
    throw new Error("Bun did not expose the reserved server port");
  }

  return port;
}

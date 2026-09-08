import { isApplicationRequestBlocked } from "../../startup";

import type { Gelis } from "../../app";

export type GelisBunOptions = Bun.Serve.HostnamePortServeOptions<undefined>;

export interface GelisBunLifecycleServer {
  readonly server: Bun.Server<undefined>;

  close(closeActiveConnections?: boolean): Promise<void>;
}

/*
 * Zero-unused Bun fast path.
 *
 * This intentionally remains synchronous and keeps the same request
 * transport shape validated by the existing adapter benchmark:
 *
 *   Bun.serve({ fetch: app.fetch.bind(app) })
 *
 * Applications with pending/failed/closed startup state must use
 * serveReady() or complete app.ready() before calling this function.
 */
export function serve(
  app: Gelis,

  options: GelisBunOptions = {},
): Bun.Server<undefined> {
  if (isApplicationRequestBlocked(app)) {
    throw new Error(
      "Gelis Bun serve() requires a ready application; " +
        "use await serveReady(app, options) or await app.ready() first",
    );
  }

  return startBunServer(app, options);
}

/*
 * Lifecycle-aware Bun startup.
 *
 * No listener is opened until Gelis application startup succeeds.
 * Startup failure therefore cannot leave a Bun transport accepting
 * requests for a failed application.
 */
export async function serveReady(
  app: Gelis,

  options: GelisBunOptions = {},
): Promise<GelisBunLifecycleServer> {
  await app.ready();

  const server = startBunServer(app, options);

  let closePromise: Promise<void> | undefined;

  return {
    server,

    close(closeActiveConnections = false): Promise<void> {
      const existing = closePromise;

      if (existing !== undefined) {
        return existing;
      }

      /*
       * Transport ownership belongs to the Bun adapter.
       *
       * Stop accepting/drain Bun first. Only after transport shutdown
       * succeeds may Gelis release application-owned resources.
       */
      const current = (async () => {
        await server.stop(closeActiveConnections);

        await app.close();
      })();

      closePromise = current;

      return current;
    },
  };
}

function startBunServer(
  app: Gelis,

  options: GelisBunOptions,
): Bun.Server<undefined> {
  return Bun.serve({
    ...options,

    fetch: app.fetch.bind(app),
  });
}

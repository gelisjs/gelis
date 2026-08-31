import type { Gelis } from "../../src";

export type GelisBunOptions = Bun.Serve.HostnamePortServeOptions<undefined>;

export function serve(
  app: Gelis,
  options: GelisBunOptions = {},
): Bun.Server<undefined> {
  return Bun.serve({
    ...options,

    fetch: app.fetch.bind(app),
  });
}

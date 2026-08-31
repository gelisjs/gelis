import type { Gelis } from "../../src";

export interface GelisBunOptions {
  readonly port?: number;
  readonly hostname?: string;
  readonly reusePort?: boolean;
  readonly development?: boolean;
  readonly maxRequestBodySize?: number;
  readonly idleTimeout?: number;
}

export function serve(
  app: Gelis,
  options: GelisBunOptions = {},
): Bun.Server<undefined> {
  return Bun.serve({
    ...options,

    fetch(request) {
      return app.fetch(request);
    },
  });
}

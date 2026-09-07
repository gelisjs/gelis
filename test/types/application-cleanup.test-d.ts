import { Gelis, definePlugin } from "../../src";

import type { PluginCleanup, PluginStartupContext } from "../../src";

import type { Equal, Expect } from "./assert";

const app = new Gelis();

const close = app.close();

type CloseReturn = Expect<Equal<typeof close, Promise<void>>>;

const cleanup: PluginCleanup = async () => {
  await Promise.resolve();
};

definePlugin(
  "cleanup-types",

  (setup) => {
    setup.startup((startup) => {
      type StartupContext = Expect<Equal<typeof startup, PluginStartupContext>>;

      void (null as unknown as StartupContext);

      startup.cleanup(cleanup);

      startup.cleanup(() => {});

      // Startup remains resource-only; it is not route composition.
      // @ts-expect-error startup does not expose route registration.
      startup.routes.get("/late", () => null);
    });
  },
);

export type { CloseReturn };

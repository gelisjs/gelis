import { defineCapability, definePlugin } from "../../src";

import type { Capability, PluginStartupContext } from "../../src";

import type { Equal, Expect } from "./assert";

interface DatabaseClient {
  readonly name: string;
}

const Database: Capability<DatabaseClient> = defineCapability("database");

const database = {
  name: "primary",
} satisfies DatabaseClient;

definePlugin(
  "startup-provider",

  (setup) => {
    setup.startup((startup) => {
      type StartupContext = Expect<Equal<typeof startup, PluginStartupContext>>;

      void (null as unknown as StartupContext);

      Database.provide(startup, database);

      const resolved = Database.require(startup);

      type ResolvedDatabase = Expect<Equal<typeof resolved, DatabaseClient>>;

      void (null as unknown as ResolvedDatabase);
    });
  },
);

definePlugin(
  "invalid-startup-provider",

  (setup) => {
    setup.startup((startup) => {
      Database.provide(
        startup,

        {
          // @ts-expect-error name must be a string.
          name: 123,
        },
      );
    });
  },
);

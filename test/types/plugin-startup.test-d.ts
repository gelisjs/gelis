import { defineCapability, definePlugin, Gelis } from "../../src";

import type { Capability, PluginStartupContext } from "../../src";

import type { Equal, Expect } from "./assert";

interface DatabaseClient {
  query(sql: string): Promise<unknown>;
}

const Database: Capability<DatabaseClient> = defineCapability("database");

const plugin = definePlugin(
  "startup-plugin",

  (setup) => {
    setup.startup(async (startup) => {
      type StartupContext = Expect<Equal<typeof startup, PluginStartupContext>>;

      void (null as unknown as StartupContext);

      const database = Database.require(startup);

      type RequiredDatabase = Expect<Equal<typeof database, DatabaseClient>>;

      void (null as unknown as RequiredDatabase);

      await database.query("select 1");

      // @ts-expect-error startup is not a route-composition surface.
      startup.routes.get("/late", () => null);
    });
  },
);

const app = new Gelis();

type BeforePlugin = typeof app;

app.use(plugin);

type AfterPlugin = typeof app;

type StableRoot = Expect<Equal<BeforePlugin, AfterPlugin>>;

export type { StableRoot };

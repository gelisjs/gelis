import { defineCapability, definePlugin, Gelis } from "../../src";

import type { Capability } from "../../src";

import type { Equal, Expect } from "./assert";

interface DatabaseClient {
  query(sql: string): Promise<unknown>;
}

const Database: Capability<DatabaseClient> = defineCapability("database");

const provider = definePlugin(
  "database-provider",

  (plugin) => {
    Database.provide(
      plugin,

      {
        async query(_sql: string) {
          return [];
        },
      },
    );
  },
);

const consumer = definePlugin(
  "database-consumer",

  (plugin) => {
    const database = Database.require(plugin);

    type RequiredDatabase = Expect<Equal<typeof database, DatabaseClient>>;

    void (null as unknown as RequiredDatabase);

    database.query("select 1");
  },
);

definePlugin(
  "invalid-provider",

  (plugin) => {
    Database.provide(
      plugin,

      {
        // @ts-expect-error query must return a Promise.
        query() {
          return 1;
        },
      },
    );
  },
);

const Untyped = defineCapability("untyped");

type UntypedValue = ReturnType<typeof Untyped.require>;

type UntypedIsFailClosed = Expect<Equal<UntypedValue, never>>;

void (null as unknown as UntypedIsFailClosed);

const app = new Gelis();

type BeforePlugin = typeof app;

app.use(provider);

app.use(consumer);

type AfterPlugin = typeof app;

type StableRoot = Expect<Equal<BeforePlugin, AfterPlugin>>;

export type { StableRoot, UntypedIsFailClosed };

import { describe, expect, test } from "bun:test";

import { Gelis, PluginInstallError, definePlugin } from "../../src";

import type { PluginStartupContext } from "../../src";

describe("application cleanup lifecycle", () => {
  test("runs cleanup once in reverse successful startup order", async () => {
    const events: string[] = [];

    const first = definePlugin(
      "first-resource",

      (setup) => {
        setup.startup((startup) => {
          events.push("acquire:first");

          startup.cleanup(async () => {
            await Promise.resolve();

            events.push("cleanup:first");
          });
        });
      },
    );

    const second = definePlugin(
      "second-resource",

      (setup) => {
        setup.startup((startup) => {
          events.push("acquire:second");

          startup.cleanup(() => {
            events.push("cleanup:second");
          });
        });
      },
    );

    const app = new Gelis();

    app.use(first);
    app.use(second);

    await app.ready();

    expect(events).toEqual(["acquire:first", "acquire:second"]);

    const firstClose = app.close();
    const secondClose = app.close();

    expect(secondClose).toBe(firstClose);

    await firstClose;

    expect(events).toEqual([
      "acquire:first",
      "acquire:second",
      "cleanup:second",
      "cleanup:first",
    ]);

    await app.close();

    expect(events).toEqual([
      "acquire:first",
      "acquire:second",
      "cleanup:second",
      "cleanup:first",
    ]);
  });

  test("rolls back acquired resources in LIFO order when later startup fails", async () => {
    const events: string[] = [];

    const first = definePlugin(
      "first-resource",

      (setup) => {
        setup.startup((startup) => {
          events.push("acquire:first");

          startup.cleanup(() => {
            events.push("cleanup:first");
          });
        });
      },
    );

    const second = definePlugin(
      "second-resource",

      (setup) => {
        setup.startup((startup) => {
          events.push("acquire:second");

          startup.cleanup(() => {
            events.push("cleanup:second");
          });

          throw new Error("second startup failed");
        });
      },
    );

    const app = new Gelis();

    app.use(first);
    app.use(second);

    await expect(app.ready()).rejects.toThrow("second startup failed");

    expect(events).toEqual([
      "acquire:first",
      "acquire:second",
      "cleanup:second",
      "cleanup:first",
    ]);

    await app.close();

    expect(events).toEqual([
      "acquire:first",
      "acquire:second",
      "cleanup:second",
      "cleanup:first",
    ]);
  });

  test("rolls back cleanup when plugin commit fails after successful startup", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.get("/collision", () => "existing");

    const plugin = definePlugin(
      "colliding-resource",

      (setup) => {
        setup.routes.get(
          "/collision",

          () => "plugin",
        );

        setup.startup((startup) => {
          events.push("acquire");

          startup.cleanup(() => {
            events.push("cleanup");
          });
        });
      },
    );

    app.use(plugin);

    await expect(app.ready()).rejects.toThrow("Duplicate route");

    expect(events).toEqual(["acquire", "cleanup"]);

    const response = await app.fetch(
      new Request("http://gelis.test/collision"),
    );

    expect(await response.text()).toBe("existing");
  });

  test("close before ready does not start pending resource acquisition", async () => {
    let startupCalls = 0;
    let cleanupCalls = 0;

    const plugin = definePlugin(
      "never-started",

      (setup) => {
        setup.startup((startup) => {
          startupCalls++;

          startup.cleanup(() => {
            cleanupCalls++;
          });
        });
      },
    );

    const app = new Gelis();

    app.use(plugin);

    await app.close();

    expect(startupCalls).toBe(0);
    expect(cleanupCalls).toBe(0);

    await expect(app.ready()).rejects.toThrow(
      "Cannot start a closed Gelis application",
    );
  });

  test("close waits for an already-running startup before cleaning it", async () => {
    const events: string[] = [];

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const plugin = definePlugin(
      "running-resource",

      (setup) => {
        setup.startup(async (startup) => {
          events.push("startup:begin");

          await gate;

          events.push("startup:end");

          startup.cleanup(() => {
            events.push("cleanup");
          });
        });
      },
    );

    const app = new Gelis();

    app.use(plugin);

    const ready = app.ready();

    await Promise.resolve();

    const close = app.close();

    expect(events).toEqual(["startup:begin"]);

    release();

    await ready;
    await close;

    expect(events).toEqual(["startup:begin", "startup:end", "cleanup"]);
  });

  test("continues LIFO cleanup after one handler fails and rejects close", async () => {
    const events: string[] = [];

    const failure = new Error("cleanup failed");

    const plugin = definePlugin(
      "cleanup-failure",

      (setup) => {
        setup.startup((startup) => {
          startup.cleanup(() => {
            events.push("cleanup:first");
          });

          startup.cleanup(() => {
            events.push("cleanup:second");

            throw failure;
          });

          startup.cleanup(() => {
            events.push("cleanup:third");
          });
        });
      },
    );

    const app = new Gelis();

    app.use(plugin);

    await app.ready();

    const firstClose = app.close();

    await expect(firstClose).rejects.toBe(failure);

    expect(events).toEqual([
      "cleanup:third",
      "cleanup:second",
      "cleanup:first",
    ]);

    expect(app.close()).toBe(firstClose);

    await expect(app.close()).rejects.toBe(failure);

    expect(events).toEqual([
      "cleanup:third",
      "cleanup:second",
      "cleanup:first",
    ]);
  });

  test("invalidates cleanup registration after startup context finishes", async () => {
    let captured: PluginStartupContext | undefined;

    const plugin = definePlugin(
      "captured-startup",

      (setup) => {
        setup.startup((startup) => {
          captured = startup;
        });
      },
    );

    const app = new Gelis();

    app.use(plugin);

    await app.ready();

    if (captured === undefined) {
      throw new Error("Expected captured startup context");
    }

    let thrown: unknown;

    try {
      captured.cleanup(() => {});
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PluginInstallError);

    expect((thrown as PluginInstallError).code).toBe(
      "PLUGIN_SETUP_CONTEXT_INACTIVE",
    );
  });
});

import { describe, expect, test } from "bun:test";

import { Gelis, definePlugin } from "../../src";

describe("application startup request gate", () => {
  test("does not specialize fetch for a plain application", async () => {
    const app = new Gelis();

    app.get("/plain", () => "plain");

    expect(hasOwnFetch(app)).toBe(false);

    const response = await app.fetch(new Request("http://gelis.test/plain"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("plain");

    expect(hasOwnFetch(app)).toBe(false);
  });

  test("blocks requests while startup is pending without triggering startup", async () => {
    let startupCalls = 0;

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const app = new Gelis();

    app.get("/existing", () => "existing");

    app.use(
      definePlugin(
        "pending-startup",

        (setup) => {
          setup.startup(async () => {
            startupCalls++;

            await gate;
          });
        },
      ),
    );

    expect(hasOwnFetch(app)).toBe(true);

    const beforeReady = await app.fetch(
      new Request("http://gelis.test/existing"),
    );

    expect(beforeReady.status).toBe(503);
    expect(await beforeReady.text()).toBe("Service Unavailable");
    expect(startupCalls).toBe(0);

    const ready = app.ready();

    await Promise.resolve();

    expect(startupCalls).toBe(1);

    const whileRunning = await app.fetch(
      new Request("http://gelis.test/existing"),
    );

    expect(whileRunning.status).toBe(503);

    release();

    await ready;

    /*
     * No onRequest/onError lifecycle exists, so successful startup
     * restores the prototype fetch hot path instead of keeping a wrapper.
     */
    expect(hasOwnFetch(app)).toBe(false);

    const afterReady = await app.fetch(
      new Request("http://gelis.test/existing"),
    );

    expect(afterReady.status).toBe(200);
    expect(await afterReady.text()).toBe("existing");
  });

  test("keeps a failed application blocked after ready rejects", async () => {
    const failure = new Error("startup failed");

    const app = new Gelis();

    app.get("/existing", () => "existing");

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

    await expect(app.ready()).rejects.toBe(failure);

    const response = await app.fetch(new Request("http://gelis.test/existing"));

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Service Unavailable");
  });

  test("blocks a closed application even when it never used startup", async () => {
    const app = new Gelis();

    app.get("/existing", () => "existing");

    const beforeClose = await app.fetch(
      new Request("http://gelis.test/existing"),
    );

    expect(beforeClose.status).toBe(200);
    expect(hasOwnFetch(app)).toBe(false);

    await app.close();

    expect(hasOwnFetch(app)).toBe(true);

    const afterClose = await app.fetch(
      new Request("http://gelis.test/existing"),
    );

    expect(afterClose.status).toBe(503);
  });

  test("does not execute onRequest while startup is blocked and restores it after ready", async () => {
    let onRequestCalls = 0;

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const app = new Gelis();

    app.get("/existing", () => "existing");

    app.onRequest(() => {
      onRequestCalls++;
    });

    app.use(
      definePlugin(
        "lifecycle-startup",

        (setup) => {
          setup.startup(() => gate);
        },
      ),
    );

    const blocked = await app.fetch(new Request("http://gelis.test/existing"));

    expect(blocked.status).toBe(503);
    expect(onRequestCalls).toBe(0);

    const ready = app.ready();

    release();

    await ready;

    /*
     * onRequest requires an application wrapper, so the instance
     * remains specialized after the startup gate itself is removed.
     */
    expect(hasOwnFetch(app)).toBe(true);

    const response = await app.fetch(new Request("http://gelis.test/existing"));

    expect(response.status).toBe(200);
    expect(onRequestCalls).toBe(1);
  });

  test("remains blocked when close is requested during running startup", async () => {
    let releaseStartup!: () => void;

    const startupGate = new Promise<void>((resolve) => {
      releaseStartup = resolve;
    });

    let releaseCleanup!: () => void;

    const cleanupGate = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });

    const app = new Gelis();

    app.get("/existing", () => "existing");

    app.use(
      definePlugin(
        "closing-startup",

        (setup) => {
          setup.startup(async (startup) => {
            await startupGate;

            startup.cleanup(() => cleanupGate);
          });
        },
      ),
    );

    const ready = app.ready();

    await Promise.resolve();

    const close = app.close();

    releaseStartup();

    await ready;

    /*
     * Startup itself has succeeded, but close() was already requested.
     * The request gate must not temporarily reopen while cleanup is pending.
     */
    const duringClose = await app.fetch(
      new Request("http://gelis.test/existing"),
    );

    expect(duringClose.status).toBe(503);

    releaseCleanup();

    await close;

    const afterClose = await app.fetch(
      new Request("http://gelis.test/existing"),
    );

    expect(afterClose.status).toBe(503);
  });
});

function hasOwnFetch(app: Gelis): boolean {
  return Object.prototype.hasOwnProperty.call(app, "fetch");
}

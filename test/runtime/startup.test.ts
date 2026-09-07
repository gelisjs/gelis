import { describe, expect, test } from "bun:test";

import { GELIS_INTERNAL_RUNTIME, Gelis } from "../../src/app";

describe("application startup coordinator", () => {
  test("keeps ready idempotent when no startup work exists", async () => {
    const app = new Gelis();

    const first = app.ready();
    const second = app.ready();

    expect(second).toBe(first);

    await first;

    expect(app.ready()).toBe(first);
  });

  test("runs startup tasks serially in registration order", async () => {
    const app = new Gelis();
    const control = app[GELIS_INTERNAL_RUNTIME]();
    const order: string[] = [];

    let releaseFirst!: () => void;

    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    control.enqueueStartup(async () => {
      order.push("first:start");

      await firstGate;

      order.push("first:end");
    });

    control.enqueueStartup(() => {
      order.push("second");
    });

    const ready = app.ready();

    await Promise.resolve();

    expect(order).toEqual(["first:start"]);

    releaseFirst();

    await ready;

    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  test("runs startup work only once across repeated ready calls", async () => {
    const app = new Gelis();
    const control = app[GELIS_INTERNAL_RUNTIME]();

    let calls = 0;

    control.enqueueStartup(() => {
      calls++;
    });

    const first = app.ready();
    const second = app.ready();

    expect(second).toBe(first);

    await first;

    expect(calls).toBe(1);
    expect(app.ready()).toBe(first);

    await app.ready();

    expect(calls).toBe(1);
  });

  test("memoizes a terminal startup failure", async () => {
    const app = new Gelis();
    const control = app[GELIS_INTERNAL_RUNTIME]();
    const failure = new Error("startup failed");

    let failedTaskCalls = 0;
    let laterTaskCalls = 0;

    control.enqueueStartup(() => {
      failedTaskCalls++;

      throw failure;
    });

    control.enqueueStartup(() => {
      laterTaskCalls++;
    });

    const first = app.ready();
    const second = app.ready();

    expect(second).toBe(first);

    await expect(first).rejects.toBe(failure);

    expect(failedTaskCalls).toBe(1);
    expect(laterTaskCalls).toBe(0);

    const third = app.ready();

    expect(third).toBe(first);

    await expect(third).rejects.toBe(failure);

    expect(failedTaskCalls).toBe(1);
    expect(laterTaskCalls).toBe(0);
  });

  test("rejects startup registration after readiness begins", async () => {
    const app = new Gelis();
    const control = app[GELIS_INTERNAL_RUNTIME]();

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    control.enqueueStartup(() => gate);

    const ready = app.ready();

    expect(() => {
      control.enqueueStartup(() => {});
    }).toThrow(/readiness has begun/);

    release();

    await ready;

    expect(() => {
      control.enqueueStartup(() => {});
    }).toThrow(/readiness has begun/);
  });
});

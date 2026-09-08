# P8-D Startup / Shutdown Lifecycle Architecture v0.1

**Phase:** P8-D1 — Semantic Contract  
**Status:** ACCEPTED / FROZEN  
**Branch baseline:** `architecture/composition-v0.1`  
**Baseline commit:** `775ef9d49d5fe750d76ac4fb880d1b8c5bf5fffc`

## Purpose

P8-D adds application startup and shutdown semantics without moving setup work into the request path, without weakening the frozen plugin/module composition model, and without imposing material cost on applications that do not use lifecycle features.

## Frozen semantic decisions

### 1. Keep plugin declaration synchronous

`PluginSetup` remains a synchronous declaration/composition phase.

A raw Promise returned from `PluginSetup` remains unsupported and continues to use:

`PLUGIN_ASYNC_SETUP_UNSUPPORTED`

This is intentional. Allowing arbitrary plugin declaration to continue after `await` would permit routes, lifecycle hooks, and composition structure to appear asynchronously, which conflicts with deterministic source-order composition and safe AOT declaration capture.

Async resource initialization is introduced through an explicit startup phase rather than by making the declaration phase asynchronous.

### 2. Add an explicit plugin startup phase

`PluginSetupContext` will gain an explicit startup-registration primitive.

Conceptual form:

```ts
setup.startup(async (startup) => {
  // asynchronous resource initialization
});
```

The startup callback is not a second route-composition surface.

It may participate in startup resource/capability resolution and cleanup registration, but route and request-lifecycle declarations remain in synchronous `PluginSetup`.

This preserves a synchronous, capturable application shape.

### 3. Preserve existing public composition signatures

These frozen signatures do not change:

```ts
app.use(plugin): this
app.mount(module): void
```

The root `Gelis` type remains stable and does not accumulate route, plugin, module, startup, or shutdown state.

### 4. Async module scope resolution is startup work

`ModuleScopeResolver<Scope>` may resolve either synchronously or asynchronously.

Synchronous resolution keeps the existing immediate/fail-fast behavior.

When a resolver produces a Promise-like value, the module becomes pending startup work. Its routes are not committed until scope resolution succeeds.

`MODULE_ASYNC_SCOPE_UNSUPPORTED` remains in the public error-code union for compatibility with the frozen API surface, but normal runtime async module scope resolution will no longer use it once P8-D support is active.

### 5. `app.ready()` is the explicit startup barrier

Gelis will expose an application readiness barrier:

```ts
await app.ready();
```

`ready()` waits for all pending startup work in deterministic source order.

Startup is never triggered by a request.

A request must not become the mechanism that initializes plugins, resolves module scopes, or acquires resources.

Repeated `ready()` calls are idempotent.

### 6. Preserve source order across the first async boundary

Before any asynchronous startup boundary exists, synchronous plugin/module behavior remains immediate as it is today.

After the first pending startup operation appears, later composition that depends on ordering is staged and finalized in source order.

A later plugin or module must not observe a false missing dependency merely because an earlier provider is still starting.

No later composition may overtake an earlier pending startup operation.

### 7. Preserve atomic composition

A plugin with startup work does not expose partially committed routes, hooks, or capabilities before its startup succeeds.

An asynchronously resolved module does not expose partially mounted routes before its scope resolves successfully.

Failure must not leave a serveable partially-started application.

### 8. Startup failure is terminal for that application instance

Existing purely synchronous install/mount failures before an async startup boundary keep their current retryable semantics.

Once asynchronous startup has begun, an async startup failure makes that application instance failed.

`ready()` rejects deterministically for that failure.

The application must not serve requests after failed startup.

### 9. Shutdown is explicit and core-owned only for application resources

Gelis core will expose an explicit asynchronous application cleanup boundary.

The exact final public name is frozen later in the P8-D API-freeze step; the working semantic is `app.close()`.

Core cleanup does not pretend to own runtime transport draining.

Runtime adapters remain responsible for stopping/listening transport behavior.

For Bun, graceful application shutdown ordering is:

```text
stop accepting/drain transport
        ↓
run Gelis application cleanup
```

### 10. Cleanup is deterministic

Cleanup handlers run at most once.

Cleanup order is reverse successful startup/composition order (LIFO), so consumers are released before providers they depend on.

Async cleanup is supported.

If startup fails after earlier startup units succeeded, registered cleanup for successfully acquired resources is run as rollback.

### 11. AOT must never execute async startup resource acquisition at build time

AOT declaration capture and runtime startup are separate phases.

Plugin startup callbacks must not run during build-time declaration capture.

Scoped module route shape must be capturable without requiring the real runtime module scope.

If a startup feature cannot be represented safely by the current AOT format, Gelis must fail/fallback explicitly rather than silently executing runtime resource acquisition during the build.

No hidden build-time database/network/resource startup is acceptable.

### 12. Zero-unused remains a hard requirement

Applications that do not use startup/shutdown features must not acquire a permanent request-path lifecycle check solely because P8-D exists.

Lifecycle state must be lazy/sidecar-oriented where practical.

Plain routes and the existing Bun adapter fast path must remain effectively unchanged when startup/shutdown capability is unused.

## Correctness acceptance gates

P8-D implementation is accepted only if:

- the existing full `bun run check` pipeline remains green;
- existing synchronous plugin and module semantics remain green;
- raw async `PluginSetup` still deterministically reports `PLUGIN_ASYNC_SETUP_UNSUPPORTED`;
- explicit plugin startup runs only through the startup lifecycle and exactly once;
- startup-produced dependencies resolve in source order;
- async module scope resolution commits routes only after success;
- plugin/module setup contexts become inactive at their specified phase boundary;
- `ready()` is idempotent;
- requests do not trigger startup work;
- pending/failed startup cannot be served accidentally;
- failed startup exposes no partial serveable composition;
- cleanup executes once in reverse successful acquisition order;
- startup rollback cleans resources already acquired by successful earlier units;
- application cleanup does not replace adapter/server draining;
- AOT build capture does not execute runtime startup hooks.

## Performance acceptance gates

The existing frozen corrected-v2 module-composition type thresholds remain unchanged at 5,000 units:

```text
instantiations <= 1.50x direct
memory         <= 1.40x direct
check time     <= 1.60x direct
normalized 100->5k instantiation growth <= 1.25x direct growth
```

For zero-unused runtime verification, a plain application that does not register startup/shutdown behavior must remain within normal benchmark noise of the P8-C control. Use a predeclared acceptance band of ±3% for the representative direct `app.fetch()` plain-route workload.

The existing Bun adapter zero/near-zero-overhead expectation remains unchanged for applications with no pending startup work.

Do not loosen these gates after candidate results are observed.

## P8-D7 zero-unused and performance validation

P8-D7 validated the production package/runtime architecture after Bun adapter graduation to `gelis/bun` and after startup/shutdown integration.

All performance thresholds below were fixed before their corresponding candidate results were evaluated.

### Production Bun adapter overhead

The production `gelis/bun` synchronous `serve()` path was compared against direct `Bun.serve({ fetch: app.fetch.bind(app) })` using 5,000 mixed routes, 50 concurrent connections, 9 samples, and four representative HTTP workloads.

The acceptance threshold required every workload to remain within `-3%` throughput of the direct control, with coefficient of variation no greater than `5%`.

Observed median throughput deltas:

```text
static-raw    -0.26%
dynamic-raw   -0.12%
static-json   -0.72%
dynamic-json  +0.41%
```

Maximum observed coefficient of variation was `3.67%`.

Result: **PASS**.

The production `gelis/bun` synchronous transport path remains effectively zero-overhead relative to direct `Bun.serve` for this benchmark.

### Restored direct request hot path after startup

A plain application was compared with an application that registered asynchronous startup work, completed `await app.ready()`, and then returned to the prototype `fetch` path.

The benchmark also asserted that neither application retained an instance-owned `fetch` wrapper and that both request paths remained synchronous.

Observed medians:

```text
plain               155.62 ns/op
startup-restored    159.83 ns/op
delta               +4.20 ns/op
delta               +2.70%
plain CV              2.14%
startup-restored CV   2.88%
```

The frozen P8-D zero-unused direct-request acceptance band is `±3%`.

Result: **PASS**.

Successful startup therefore does not leave a measurable request-path regression outside the previously accepted benchmark-noise band.

### Restored HTTP hot path after startup

The startup-restored application was also measured end-to-end over Bun HTTP against a plain application using the same production Bun adapter surface.

A first run contained a workload with coefficient of variation above the predeclared `5%` validity limit and was classified as invalid rather than accepted or rejected. One unchanged rerun was performed.

The valid rerun produced:

```text
static-raw     -1.56%
dynamic-raw    +0.48%
static-json    -1.11%
dynamic-json   -1.04%
```

Maximum coefficient of variation in the valid run was `4.27%`.

The acceptance threshold required every workload to remain at or above `-3%`.

Result: **PASS**.

### Type scalability regression gate

The frozen P8-C retained-route module-composition type scalability benchmark was rerun after P8-D lifecycle integration.

At 5,000 composition units:

```text
instantiations vs direct control    1.211x
memory vs direct control            1.321x
check time vs direct control        1.357x
normalized instantiation growth     1.144x
```

Frozen limits:

```text
instantiations <= 1.50x
memory         <= 1.40x
check time     <= 1.60x
normalized 100->5k instantiation growth <= 1.25x
```

All four gates passed.

Result: **PASS**.

### P8-D7 conclusion

The accepted P8-D lifecycle architecture satisfies its zero-unused and scalability requirements on the validated environment:

```text
Runtime:      Bun 1.4.0
TypeScript:   7.0.2
CPU:          Intel Core i5-10500H
Logical CPUs: 12
```

P8-D7 is accepted. No lifecycle performance threshold was relaxed after benchmark results were observed.

## Planned implementation sequence

P8-D2: internal startup coordinator and `app.ready()`  
P8-D3: explicit plugin startup registration and source-order staging  
P8-D4: async module scope resolution  
P8-D5: cleanup, rollback, and application close semantics  
P8-D6: AOT and Bun adapter integration  
P8-D7: zero-unused runtime and type scalability validation  
P8-D8: public lifecycle API freeze

No production implementation is accepted before its correctness tests pass.

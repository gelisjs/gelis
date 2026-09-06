# P8 Application Composition Architecture

Status: **P8-A in progress**  
Runtime target: **Bun 1.4.0**  
TypeScript target: **7.0.2**  
Branch: `architecture/composition-v0.1`

## Goal

P8 defines how Gelis applications compose services, request capabilities, plugins, modules, and lifecycle without sacrificing the invariants already established in P5-P7.

This phase is intentionally architecture-first.

No production context-extension API is accepted until:

1. its type shape is validated;
2. its runtime shape is measured;
3. plain-route zero-unused behavior is preserved;
4. module/plugin composition semantics are explicit.

---

## Existing Gelis invariants

The following are treated as frozen constraints.

### Stable root application type

Route registration must not grow the root `Gelis` type.

Existing invariant:

```ts
const app = new Gelis();

type Before = typeof app;

app.get("/one", () => null);
app.get("/two/:id", () => null);

type After = typeof app;

// Before and After remain equal.
```

P8 must preserve the same property for application composition.

### Statement-oriented registration

Routes return `RouteRef` values.

Application-wide type information should not be accumulated by chaining route calls into a progressively larger application generic.

### Zero-unused runtime

An application that does not use a capability, plugin, or context extension should not pay request-time lookup/registry overhead for that feature.

### Portable core

Application composition must remain compatible with the Web Standards core.

No Bun-only runtime primitive may be required by the public composition model.

### Reusable modules

A module is a reusable route template.

A module must not become permanently bound to one application's mutable runtime state merely because it was defined once.

### Existing fast paths remain protected

P5 routing, P6 AOT, and P7 validation are frozen.

P8 may integrate with them, but must not reopen them for speculative micro-optimizations.

---

## Terminology

P8 separates concepts that other frameworks often combine.

### Application capability

A value created or supplied at application setup time and shared by routes that explicitly consume it.

Examples:

- database pool;
- logger;
- configuration service;
- mail client;
- cache client.

An application capability is not automatically mutable global state.

The referenced object may have internal mutable state, but Gelis should not introduce a generic global key/value store as the primary primitive.

### Request capability

A value computed for one request.

Examples:

- authenticated user;
- tenant;
- request ID;
- transaction;
- authorization result.

Request capabilities have different lifetime and runtime requirements from application capabilities and should not be conflated with them.

### Plugin

A reusable package that may install routes, lifecycle behavior, application capabilities, request capabilities, metadata, or startup/shutdown behavior.

P8-A does not finalize the plugin API.

It only establishes context/capability primitives that P8-B can safely build upon.

---

## Competitor observations

### Hono

Hono exposes context variables through `Context.set/get/var`.

Runtime storage is lazily allocated.

Typing is supplied through an application `Env['Variables']` generic or module augmentation.

Useful ideas:

- lazy runtime storage;
- request variables are explicitly request-scoped;
- no allocation until variables are used.

Trade-offs for Gelis:

- application/environment generics become part of the context type;
- module augmentation introduces ambient typing;
- a generic context variable map is less explicit for AI/tooling than capability-local contracts.

### Elysia

Elysia extends context through application type state such as:

- decorator;
- store;
- derive;
- resolve / request-derived state depending on version.

Useful ideas:

- application-singleton and request-derived values are distinct concepts;
- extension scope is explicit;
- plugins can export context capabilities.

Trade-offs for Gelis:

- extension information participates heavily in the application type algebra;
- plugin/macro/context combinations can make inference boundaries complex;
- context composition and plugin composition become tightly coupled.

### Gelis direction

Gelis should preserve explicit composition without making the root application type cumulative.

The leading hypothesis is therefore a scoped/capability architecture rather than ambient global context widening.

This is a hypothesis, not yet a production decision.

---

# P8-A — Application Context Architecture

## A1 — Type model comparison

Status: **CURRENT**

Three models are compared before implementation.

### Candidate 1 — Root-generic context

Representative shape:

```ts
const app = new App().extend({ db }).extend({ logger });

app.get("/users", ({ db, logger }) => {
  // ...
});
```

Properties:

- excellent handler ergonomics;
- application type accumulates capability information;
- plugin composition naturally widens the root type.

Risk:

- violates the existing stable-root direction;
- cumulative intersections may affect large-project type cost.

This candidate is retained as a comparison baseline, not as the preferred design.

### Candidate 2 — Scoped builder

Representative shape:

```ts
const app = new Gelis();

const serviceRoutes = app.context({
  db,
  logger,
});

serviceRoutes.get("/users", ({ db, logger }) => {
  // ...
});

app.get("/health", () => "ok");
```

Properties:

- root `Gelis` remains stable;
- only routes using the scoped builder carry the extension type;
- plain routes remain outside the extension type algebra;
- a plugin could later expose or create a specialized builder.

Open questions:

- collision semantics;
- nested scope composition;
- module requirements;
- application capability lifetime;
- request-derived capability integration.

### Candidate 3 — Typed capability/token

Representative shape:

```ts
const db = defineCapability<Database>("db");

const app = new Gelis();

app.provide(db, database);

app.get("/users", (context) => {
  const database = context.use(db);
});
```

Properties:

- root type can remain completely stable;
- each capability carries its own type;
- composition does not require one large context object type;
- collisions can be identity-based rather than string-based.

Open questions:

- handler ergonomics;
- whether every context needs a `use()` accessor;
- lookup cost;
- request-local storage;
- AI readability compared with direct properties.

---

## A1 benchmark workload

The first benchmark is type-only.

It does not represent production runtime performance.

Fixed capability count:

```text
32 capabilities
```

Route sizes:

```text
100
500
1000
5000
```

Models:

```text
baseline
root-generic
scoped-builder
capability-token
```

Each route consumes four capabilities.

Generated routes are split across multiple files so the benchmark resembles a larger project rather than one enormous source file.

Metrics:

- TypeScript instantiations;
- memory;
- check time;
- total time.

---

## Frozen A1 interpretation rules

These rules are fixed before seeing benchmark results.

### Correctness gate

Every candidate must:

- typecheck without `any` escape hatches;
- reject invalid capability values;
- expose the expected capability types inside handlers.

### Root stability gate

Any final Gelis candidate must allow:

```ts
const app = new Gelis();

type Before = typeof app;

// install/register capabilities

type After = typeof app;
```

with `Before` and `After` remaining equal.

A root-generic comparison may intentionally fail this architectural gate and still remain useful as benchmark evidence.

### Ambient typing gate

The final architecture must not require TypeScript module augmentation for ordinary plugin/capability use.

Ambient augmentation may exist for optional ecosystem integrations, but must not be the core mechanism.

### Type scalability gate

The candidate must not show pathological or obviously superlinear growth across the 100 → 500 → 1000 → 5000 route progression.

Absolute TypeScript cost is secondary to growth shape and comparison with the baseline/current Gelis philosophy.

No candidate is accepted from one size alone.

### Runtime gate

A1 does not accept a production model.

The type winner(s) advance to A2 runtime prototyping.

A2 must separately prove:

- plain-route zero-unused behavior;
- application-capability access cost;
- request-capability storage/access cost if included;
- no mandatory per-request registry scan.

### Ergonomics gate

The final API should be explicit enough that a developer or coding agent can determine from local code:

- where a capability comes from;
- its lifetime;
- which routes receive it;
- whether it is application-scoped or request-scoped.

Implicit ambient context is disfavored.

---

## P8-A provisional architecture boundaries

The following are provisional but intentionally strong.

### Application and request capabilities stay separate

Do not create one universal `state` bag and use it for both.

Application capability:

```text
created/supplied during application setup
shared reference
```

Request capability:

```text
created during request execution
request-local lifetime
```

They may share a common type identity later, but their storage and lifecycle semantics should remain distinguishable.

### No automatic flat context growth on every route

Installing a database plugin should not make every route's runtime context larger if the route never consumes the database capability.

### No stringly-typed primary API

A primary API like:

```ts
context.get("db");
```

without a typed capability contract is not sufficient.

If string names are surfaced for debugging, their runtime identity should not be the only source of type safety.

### Capability collisions must be explicit

Two unrelated plugins exporting `user` must not silently overwrite one another.

Identity-based capability references are one possible solution.

Scoped builders with structural context require an explicit collision rule.

### Modules may declare requirements later

P8-C may allow a module to declare that it requires capabilities without capturing a concrete application instance.

Illustrative only:

```ts
const users = defineModule("/users", { requires: [database] }, (route) => ({
  // ...
}));
```

This syntax is not locked.

The architectural requirement is reusable module templates plus explicit dependencies.

---

# P8 roadmap

```text
P8-A Application Context
  A1 type model comparison
  A2 runtime model comparison
  A3 application-capability prototype
  A4 request-capability prototype
  A5 correctness + zero-unused + type scalability
  A6 freeze public primitive

P8-B Plugin / Extension Model
  plugin identity
  installation semantics
  capability export/import
  lifecycle integration
  duplicate handling
  plugin scope

P8-C Module Composition
  capability requirements
  module/plugin boundaries
  nested composition
  contract compatibility

P8-D Startup / Shutdown
  initialization
  resource readiness
  cleanup ordering
  failure semantics

P8-E Composition Validation
  runtime correctness
  type scalability
  large composition workload

P8-F Performance Gate
  zero-unused
  plugin-installed-but-unused
  capability-consuming routes
  external comparison where useful
```

---

## Current decision

No production API is frozen yet.

Current leading hypothesis:

```text
stable Gelis root
+
typed scoped/capability composition
+
separate application/request lifetimes
+
zero-unused specialization
```

Next action:

```text
Run P8-A1 type-model benchmark.
```

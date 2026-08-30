# Gelis API Surface v0.1

**Status:** Draft 1 — not frozen.

Exact syntax may change after the type-system prototype is measured.

## Root application

The root application type remains stable.

```ts
const app = new Gelis();

app.get("/health", () => ({
  status: "ok",
}));

app.get("/users/:id", getUser);
```

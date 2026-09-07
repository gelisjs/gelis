import { Gelis } from "../../src";

import type { Equal, Expect } from "./assert";

const app = new Gelis();

const ready = app.ready();

type ReadyReturn = Expect<Equal<typeof ready, Promise<void>>>;

type BeforeRoutes = typeof app;

app.get("/one", () => null);
app.get("/two/:id", () => null);

type AfterRoutes = typeof app;

type StableRootApp = Expect<Equal<BeforeRoutes, AfterRoutes>>;

export type { ReadyReturn, StableRootApp };

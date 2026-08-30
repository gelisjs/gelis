import { Gelis } from "../../src";

import type { Equal, Expect } from "./assert";

const app = new Gelis();

type BeforeRoutes = typeof app;

app.get("/one", () => null);
app.get("/two/:id", () => null);
app.get("/three/:slug", () => null);

type AfterRoutes = typeof app;

type StableRootApp = Expect<Equal<BeforeRoutes, AfterRoutes>>;

export type { StableRootApp };

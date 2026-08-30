import { Gelis } from "../../src";

import type { RouteRef } from "../../src";
import type { Equal, Expect } from "./assert";

const app = new Gelis();

const getUser = app.get("/users/:id", ({ params }) => {
  const id: string = params.id;

  return {
    id,
  };
});

type RouteContract = Expect<
  Equal<typeof getUser, RouteRef<"GET", "/users/:id">>
>;

app.get("/teams/:teamId/users/:userId", ({ params }) => {
  const teamId: string = params.teamId;
  const userId: string = params.userId;

  return {
    teamId,
    userId,
  };
});

app.get("/health", ({ params }) => {
  // @ts-expect-error health has no id parameter
  params.id;

  return {
    status: "ok",
  };
});

export type { RouteContract };

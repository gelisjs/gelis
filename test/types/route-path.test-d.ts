import { Gelis } from "../../src";

const app = new Gelis();

app.get("/", () => null);

app.get("/users", () => null);

app.get("/users/:id", ({ params }) => {
  const id: string = params.id;

  return id;
});

app.get("/teams/:teamId/users/:userId", ({ params }) => {
  const teamId: string = params.teamId;
  const userId: string = params.userId;

  return {
    teamId,
    userId,
  };
});

// Optional parameters are deliberately unsupported in v0.1.

// @ts-expect-error optional route parameters are not supported
app.get("/users/:id?", () => null);

// Wildcards are deliberately unsupported in v0.1.

// @ts-expect-error wildcard routes are not supported
app.get("/files/*", () => null);

// Gelis route paths must begin with /.

// @ts-expect-error route paths must begin with /
app.get("users/:id", () => null);

import { Gelis } from "gelis";

const app = new Gelis();

app.get("/", () => "portable");

// Portable consumers must not receive Bun globals through `gelis`.
// @ts-expect-error Bun must not exist in the portable consumer graph.
Bun.serve;

void app;

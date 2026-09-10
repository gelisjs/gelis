import { Gelis } from "gelis";
import {
  generateCookie,
  getCookie,
  setCookie,
} from "gelis/cookie";
import { cors } from "gelis/cors";

const app = new Gelis();

app.use(
  cors({
    origin: "https://client.example",
    credentials: true,
  }),
);

app.get("/", () => "portable");

const request = new Request("https://example.test/", {
  headers: {
    Cookie: "theme=dark",
  },
});

const theme = getCookie(request, "theme");
const headers = new Headers();

setCookie(headers, "theme", theme ?? "light", {
  sameSite: "Lax",
});

generateCookie("__Host-session", "value", {
  secure: true,
});

// Portable consumers must not receive Bun globals through `gelis`,
// `gelis/cookie`, or `gelis/cors`.
// @ts-expect-error Bun must not exist in the portable consumer graph.
Bun.serve;

void app;
void headers;

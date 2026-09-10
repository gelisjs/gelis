import { Gelis } from "gelis";
import {
  generateCookie,
  getCookie,
  setCookie,
} from "gelis/cookie";

const app = new Gelis();

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

// Portable consumers must not receive Bun globals through `gelis` or
// `gelis/cookie`.
// @ts-expect-error Bun must not exist in the portable consumer graph.
Bun.serve;

void app;
void headers;

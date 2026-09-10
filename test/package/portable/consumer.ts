import { Gelis } from "gelis";
import {
  bodyLimit,
  type BodyLimitCapability,
  type BodyLimitOptions,
  type BodyLimitReadResult,
} from "gelis/body-limit";
import { generateCookie, getCookie, setCookie } from "gelis/cookie";
import { cors } from "gelis/cors";

const app = new Gelis();

app.use(
  cors({
    origin: "https://client.example",
    credentials: true,
  }),
);

const bodyLimitOptions: BodyLimitOptions = {
  maxBytes: 1024,
  onExceeded(request, maxBytes) {
    request.headers.get("content-length");

    return Response.json(
      {
        error: "too large",
        maxBytes,
      },
      {
        status: 413,
      },
    );
  },
};

const bodyLimitCapability: BodyLimitCapability = bodyLimit(bodyLimitOptions);
app.use(bodyLimitCapability);

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

async function inspectLimitedBody(request: Request): Promise<void> {
  const result: BodyLimitReadResult =
    await bodyLimitCapability.readBody(request);

  if (result.ok) {
    result.bytes.byteLength;
  } else {
    result.response.status;
  }
}

// Portable consumers must not receive Bun globals through `gelis`,
// `gelis/cookie`, `gelis/cors`, or `gelis/body-limit`.
// @ts-expect-error Bun must not exist in the portable consumer graph.
Bun.serve;

void app;
void headers;
void inspectLimitedBody;

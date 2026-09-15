import { Gelis } from "gelis";
import {
  bodyLimit,
  type BodyLimitCapability,
  type BodyLimitOptions,
  type BodyLimitReadResult,
} from "gelis/body-limit";
import { generateCookie, getCookie, setCookie } from "gelis/cookie";
import { cors } from "gelis/cors";
import {
  requestId,
  type RequestIdCapability,
  type RequestIdGenerator,
  type RequestIdOptions,
  type RequestIdValidator,
} from "gelis/request-id";
import {
  secureHeaders,
  type SecureHeadersCrossOriginEmbedderPolicy,
  type SecureHeadersCrossOriginOpenerPolicy,
  type SecureHeadersCrossOriginResourcePolicy,
  type SecureHeadersOptions,
  type SecureHeadersReferrerPolicy,
  type SecureHeadersStrictTransportSecurityOptions,
} from "gelis/secure-headers";
import {
  GelisTimeoutError,
  timeout,
  type TimeoutCapability,
  type TimeoutHandler,
  type TimeoutOptions,
  type TimeoutRoutePolicy,
  type TimeoutSource,
} from "gelis/timeout";

const app = new Gelis();

const requestIdGenerator: RequestIdGenerator = () => "portable-id";
const requestIdValidator: RequestIdValidator = (value, request) => {
  request.headers.get("x-request-id");
  return value.startsWith("edge-");
};
const requestIdOptions: RequestIdOptions = {
  generator: requestIdGenerator,
  acceptIncoming: requestIdValidator,
};
const ids: RequestIdCapability = requestId(requestIdOptions);
app.use(ids);

const timeoutHandler: TimeoutHandler = (_request, error) => {
  const source: TimeoutSource = error.source;
  void source;
  return new Response(error.message, { status: 503 });
};
const timeoutOptions: TimeoutOptions = {
  duration: 1_000,
  onTimeout: timeoutHandler,
};
const deadlines: TimeoutCapability = timeout(timeoutOptions);
const routeDeadline: TimeoutRoutePolicy = deadlines.route(500);
app.use(deadlines);
app.get("/timed", { timeout: routeDeadline }, () => "timed");

const timeoutError = new GelisTimeoutError(500, "route");
timeoutError.duration;
timeoutError.source;

// @ts-expect-error duration must be numeric.
timeout({ duration: "1000" });
// @ts-expect-error route duration must be numeric.
deadlines.route("500");
// @ts-expect-error route timeout must be an opaque timeout policy.
app.get("/invalid-timeout", { timeout: 500 }, () => "invalid");
// @ts-expect-error request-ID header must be a string.
requestId({ header: 123 });

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

const strictTransportSecurity: SecureHeadersStrictTransportSecurityOptions = {
  maxAge: 31536000,
  includeSubDomains: true,
  preload: true,
};
const referrerPolicy: SecureHeadersReferrerPolicy = "strict-origin";
const embedderPolicy: SecureHeadersCrossOriginEmbedderPolicy = "require-corp";
const openerPolicy: SecureHeadersCrossOriginOpenerPolicy = "same-origin";
const resourcePolicy: SecureHeadersCrossOriginResourcePolicy = "same-site";
const secureHeaderOptions: SecureHeadersOptions = {
  strictTransportSecurity,
  referrerPolicy,
  crossOriginEmbedderPolicy: embedderPolicy,
  crossOriginOpenerPolicy: openerPolicy,
  crossOriginResourcePolicy: resourcePolicy,
  contentSecurityPolicy: "default-src 'self'",
  permissionsPolicy: "camera=()",
};

app.use(secureHeaders(secureHeaderOptions));
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

// Portable consumers must not receive Bun globals through `gelis` or any
// portable Gelis subpath, including request-ID and timeout capabilities.
// @ts-expect-error Bun must not exist in the portable consumer graph.
Bun.serve;

void app;
void headers;
void inspectLimitedBody;

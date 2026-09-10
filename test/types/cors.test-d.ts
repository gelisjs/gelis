import { Gelis } from "../../src/app";
import {
  cors,
  type CorsOptions,
  type CorsOrigin,
  type CorsOriginResolver,
} from "../../src/cors/index";
import type { Plugin } from "../../src/plugin";

const app = new Gelis();

const defaultCors: Plugin = cors();
app.use(defaultCors);

const resolver: CorsOriginResolver = (origin, request) => {
  request.headers.get("origin");
  return origin === "https://client.example";
};

const asyncResolver: CorsOriginResolver = async (origin) =>
  origin === "https://client.example";

const origins: CorsOrigin = [
  "https://client.example",
  "https://admin.example",
];

const options: CorsOptions = {
  origin: origins,
  methods: ["GET", "POST", "QUERY", "PROPFIND"],
  allowHeaders: ["Authorization", "Content-Type"],
  exposeHeaders: ["X-Request-Id"],
  credentials: true,
  maxAge: 600,
};

cors(options);
cors({ origin: "https://client.example", credentials: true });
cors({ origin: resolver });
cors({ origin: asyncResolver });
cors({ allowHeaders: "request" });

// Obvious wildcard + credential configurations are rejected at compile time.
// @ts-expect-error credentialed CORS must name/resolve an explicit origin.
cors({ credentials: true });

// @ts-expect-error wildcard origin cannot be used with credentials.
cors({ origin: "*", credentials: true });

// Dynamic option objects remain runtime-validated.
const dynamicOptions: CorsOptions = {
  origin: "*",
  credentials: true,
};
cors(dynamicOptions);

void app;

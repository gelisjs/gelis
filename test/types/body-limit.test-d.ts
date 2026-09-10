import { Gelis } from "../../src/app";
import {
  bodyLimit,
  type BodyLimitCapability,
  type BodyLimitExceededHandler,
  type BodyLimitOptions,
  type BodyLimitReadResult,
} from "../../src/body-limit/index";
import type { Plugin } from "../../src/plugin";

const app = new Gelis();

const syncExceeded: BodyLimitExceededHandler = (request, maxBytes) => {
  request.headers.get("content-length");
  maxBytes.toFixed(0);

  return new Response("too large", { status: 413 });
};

const asyncExceeded: BodyLimitExceededHandler = async (_request, maxBytes) =>
  Response.json({ maxBytes }, { status: 413 });

const options: BodyLimitOptions = {
  maxBytes: 1024,
  onExceeded: syncExceeded,
};

const plugin: Plugin = bodyLimit(options);
const capability: BodyLimitCapability = bodyLimit({
  maxBytes: 2048,
  onExceeded: asyncExceeded,
});

app.use(plugin);

capability.maxBytes.toFixed(0);

async function inspectResult(request: Request): Promise<void> {
  const result: BodyLimitReadResult = await capability.readBody(request);

  if (result.ok) {
    const bytes: Uint8Array = result.bytes;
    bytes.byteLength;

    // @ts-expect-error success results do not contain an overflow response.
    result.response;
  } else {
    const response: Response = result.response;
    response.status;

    // @ts-expect-error overflow results do not contain body bytes.
    result.bytes;
  }
}

bodyLimit({ maxBytes: 0 });

// @ts-expect-error maxBytes is required.
bodyLimit({});

// @ts-expect-error maxBytes must be a number.
bodyLimit({ maxBytes: "1024" });

// @ts-expect-error overflow handlers must return a Response or PromiseLike<Response>.
bodyLimit({ maxBytes: 1024, onExceeded: () => "too large" });

app.post(
  "/limited",
  {
    body: {
      "~standard": {
        version: 1,
        vendor: "gelis-test",
        validate(value: unknown) {
          return { value };
        },
      },
    },
    bodyLimit: 1024,
  },
  ({ body }) => body,
);

app.post(
  "/invalid-limit",
  {
    body: {
      "~standard": {
        version: 1,
        vendor: "gelis-test",
        validate(value: unknown) {
          return { value };
        },
      },
    },
    // @ts-expect-error route bodyLimit must be numeric.
    bodyLimit: "1024",
  },
  () => "never",
);

void inspectResult;

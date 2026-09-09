import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROUTES = 5_000;
const TARGET_INDEX = ROUTES - 1;
const WARMUP_ITERATIONS = 10_000;
const MEASURED_ITERATIONS = 20_000;

type Variant = "manual" | "managed";
type MultipartValue = string | File | Array<string | File>;
type MultipartBody = Record<string, MultipartValue>;

interface RequestContext {
  readonly request: Request;
}

interface AppLike {
  post(path: string, handler: (context: RequestContext) => unknown): unknown;
  post(
    path: string,
    options: object,
    handler: (context: RequestContext) => unknown,
  ): unknown;
  fetch(request: Request): Response | Promise<Response>;
}

interface GelisConstructor {
  new (): AppLike;
}

const args = process.argv.slice(2);
const root = readArgument(args, "--root=");
const variant = readVariant(args);

const module = (await import(
  pathToFileURL(resolve(root, "src/index.ts")).href
)) as {
  readonly Gelis: GelisConstructor;
};

const app = createApplication(module.Gelis, variant);
const request = createRequest();

let sink = 0;

await verifyCorrectness(app, request);
await warmup(app, request);

writeMessage({
  type: "ready",
  variant,
});

const input = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

for await (const line of input) {
  if (line === "measure") {
    Bun.gc(true);

    const ns = await measure(app, request);

    writeMessage({
      type: "measurement",
      ns,
    });

    continue;
  }

  if (line === "close") {
    input.close();
    break;
  }

  throw new Error(`Unknown worker command: ${line}`);
}

void sink;

function createApplication(
  Constructor: GelisConstructor,
  selectedVariant: Variant,
): AppLike {
  const application = new Constructor();

  const Body = {
    "~standard": {
      version: 1 as const,
      vendor: "gelis-bench",
      validate(value: unknown) {
        const body = value as MultipartBody;

        if (
          Object.getPrototypeOf(body) !== null ||
          body.name !== "Gelis" ||
          !Array.isArray(body.tag) ||
          body.tag.length !== 2 ||
          body.tag[0] !== "a" ||
          body.tag[1] !== "b"
        ) {
          return {
            issues: [
              {
                message: "Invalid normalized multipart payload",
              },
            ],
          };
        }

        return {
          value: body,
        };
      },
    },
  };

  const response = new Response("ok");

  for (let index = 0; index < ROUTES; index++) {
    const path = `/r/${index}`;

    if (selectedVariant === "managed") {
      application.post(
        path,
        {
          body: Body,
          bodyParser: "multipart",
        },
        () => response,
      );

      continue;
    }

    application.post(path, ({ request }) => {
      if (!isMultipartFormData(request)) {
        return unsupportedMediaTypeResponse();
      }

      return request
        .formData()
        .then(normalizeMultipartFormData)
        .then(
          (decoded) => {
            const validation = Body["~standard"].validate(decoded);

            if ("issues" in validation) {
              return validationErrorResponse();
            }

            return response;
          },
          () => malformedBodyResponse(),
        );
    });
  }

  return application;
}

function createRequest(): Request {
  const headers = {
    get(name: string): string | null {
      return name.toLowerCase() === "content-type"
        ? "multipart/form-data; boundary=gelis-bench"
        : null;
    },
  };

  const formData = new FormData();
  formData.append("name", "Gelis");
  formData.append("tag", "a");
  formData.append("tag", "b");

  return {
    method: "POST",
    url: `http://gelis.test/r/${TARGET_INDEX}`,
    headers,

    formData() {
      return Promise.resolve(formData);
    },
  } as unknown as Request;
}

function normalizeMultipartFormData(formData: FormData): MultipartBody {
  const result = Object.create(null) as MultipartBody;

  formData.forEach((entryValue, key) => {
    const existing = result[key];

    if (existing === undefined) {
      result[key] = entryValue;
    } else if (Array.isArray(existing)) {
      existing.push(entryValue);
    } else {
      result[key] = [existing, entryValue];
    }
  });

  return result;
}

function isMultipartFormData(request: Request): boolean {
  const contentType = request.headers.get("content-type");

  if (contentType === null) {
    return false;
  }

  if (contentType.length === 19 && contentType === "multipart/form-data") {
    return true;
  }

  let quoted = false;
  let escaped = false;

  for (let index = 0; index < contentType.length; index++) {
    const code = contentType.charCodeAt(index);

    if (escaped) {
      escaped = false;
      continue;
    }

    if (quoted && code === 92) {
      escaped = true;
      continue;
    }

    if (code === 34) {
      quoted = !quoted;
      continue;
    }

    if (!quoted && code === 44) {
      return false;
    }
  }

  const separator = contentType.indexOf(";");

  return (
    (separator === -1 ? contentType : contentType.slice(0, separator))
      .trim()
      .toLowerCase() === "multipart/form-data"
  );
}

function unsupportedMediaTypeResponse(): Response {
  return Response.json(
    {
      error: {
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "Unsupported request body media type",
      },
    },
    {
      status: 415,
    },
  );
}

function malformedBodyResponse(): Response {
  return Response.json(
    {
      error: {
        code: "MALFORMED_BODY",
        message: "Malformed request body",
      },
    },
    {
      status: 400,
    },
  );
}

function validationErrorResponse(): Response {
  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        target: "body",
        issues: [],
      },
    },
    {
      status: 422,
    },
  );
}

async function verifyCorrectness(
  application: AppLike,
  request: Request,
): Promise<void> {
  const response = await application.fetch(request);

  if (!(response instanceof Response)) {
    throw new Error("Worker application did not return a Response");
  }

  if (response.status !== 200) {
    throw new Error(`Unexpected worker response status: ${response.status}`);
  }
}

async function warmup(application: AppLike, request: Request): Promise<void> {
  for (let index = 0; index < WARMUP_ITERATIONS; index++) {
    await consume(application.fetch(request));
  }
}

async function measure(
  application: AppLike,
  request: Request,
): Promise<number> {
  const start = performance.now();

  for (let index = 0; index < MEASURED_ITERATIONS; index++) {
    await consume(application.fetch(request));
  }

  return ((performance.now() - start) * 1_000_000) / MEASURED_ITERATIONS;
}

async function consume(result: Response | Promise<Response>): Promise<void> {
  const response = await result;
  sink += response.status;
}

function readArgument(values: readonly string[], prefix: string): string {
  const argument = values.find((value) => value.startsWith(prefix));
  const value = argument?.slice(prefix.length);

  if (!value) {
    throw new Error(`Expected ${prefix}<value>`);
  }

  return resolve(value);
}

function readVariant(values: readonly string[]): Variant {
  const argument = values.find((value) => value.startsWith("--variant="));
  const value = argument?.slice("--variant=".length);

  if (value === "manual" || value === "managed") {
    return value;
  }

  throw new Error("Expected --variant=manual|managed");
}

function writeMessage(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

import { Hono } from "hono";
import {
  generateCookie as honoGenerateCookie,
  generateSignedCookie as honoGenerateSignedCookie,
  getCookie as honoGetCookie,
  getSignedCookie as honoGetSignedCookie,
} from "hono/cookie";

import {
  generateCookie as gelisGenerateCookie,
  generateSignedCookie as gelisGenerateSignedCookie,
  getCookie as gelisGetCookie,
  getSignedCookie as gelisGetSignedCookie,
} from "../../src/cookie/public";

type Framework = "gelis" | "hono";
type Scenario =
  | "get-8"
  | "get-32"
  | "generate-basic"
  | "generate-rich"
  | "signed-generate"
  | "signed-verify";

const SECRET = "p11-cookie-benchmark-secret-0123456789abcdef";

const framework = readArg<Framework>("framework", ["gelis", "hono"]);
const scenario = readArg<Scenario>("scenario", [
  "get-8",
  "get-32",
  "generate-basic",
  "generate-rich",
  "signed-generate",
  "signed-verify",
]);

const signed = scenario === "signed-generate" || scenario === "signed-verify";
const iterations = readNumberArg("iterations", signed ? 2_000 : 200_000);
const warmups = readNumberArg("warmups", signed ? 200 : 20_000);

const operation = await createOperation(framework, scenario);

let sink = 0;

for (let index = 0; index < warmups; index++) {
  sink ^= consume(await operation());
}

const started = Bun.nanoseconds();

for (let index = 0; index < iterations; index++) {
  sink ^= consume(await operation());
}

const elapsed = Bun.nanoseconds() - started;
const nsPerOp = elapsed / iterations;

console.log(
  JSON.stringify({
    framework,
    scenario,
    iterations,
    warmups,
    nsPerOp,
    sink,
  }),
);

async function createOperation(
  selectedFramework: Framework,
  selectedScenario: Scenario,
): Promise<() => unknown | Promise<unknown>> {
  if (selectedFramework === "gelis") {
    return createGelisOperation(selectedScenario);
  }

  return createHonoOperation(selectedScenario);
}

async function createGelisOperation(
  selectedScenario: Scenario,
): Promise<() => unknown | Promise<unknown>> {
  switch (selectedScenario) {
    case "get-8": {
      const request = new Request("https://example.test/", {
        headers: { Cookie: createCookieHeader(8) },
      });
      return () => gelisGetCookie(request, "target");
    }

    case "get-32": {
      const request = new Request("https://example.test/", {
        headers: { Cookie: createCookieHeader(32) },
      });
      return () => gelisGetCookie(request, "target");
    }

    case "generate-basic":
      return () => gelisGenerateCookie("theme", "dark");

    case "generate-rich":
      return () =>
        gelisGenerateCookie("session", "user-123", {
          domain: "example.com",
          httpOnly: true,
          maxAge: 3600,
          partitioned: true,
          path: "/api",
          priority: "High",
          sameSite: "None",
          secure: true,
        });

    case "signed-generate":
      return () => gelisGenerateSignedCookie("session", "user-123", SECRET);

    case "signed-verify": {
      const setCookie = await gelisGenerateSignedCookie(
        "session",
        "user-123",
        SECRET,
      );
      const request = requestFromSetCookie(setCookie);
      return () => gelisGetSignedCookie(request, "session", SECRET);
    }
  }
}

async function createHonoOperation(
  selectedScenario: Scenario,
): Promise<() => unknown | Promise<unknown>> {
  switch (selectedScenario) {
    case "get-8":
      return createHonoReadOperation(createCookieHeader(8));

    case "get-32":
      return createHonoReadOperation(createCookieHeader(32));

    case "generate-basic":
      return () => honoGenerateCookie("theme", "dark");

    case "generate-rich":
      return () =>
        honoGenerateCookie("session", "user-123", {
          domain: "example.com",
          httpOnly: true,
          maxAge: 3600,
          partitioned: true,
          path: "/api",
          priority: "High",
          sameSite: "None",
          secure: true,
        });

    case "signed-generate":
      return () => honoGenerateSignedCookie("session", "user-123", SECRET);

    case "signed-verify": {
      const setCookie = await honoGenerateSignedCookie(
        "session",
        "user-123",
        SECRET,
      );
      const pair = firstCookiePair(setCookie);
      return createHonoSignedReadOperation(pair);
    }
  }
}

async function createHonoReadOperation(
  cookieHeader: string,
): Promise<() => unknown> {
  let operation: (() => unknown) | undefined;
  const app = new Hono();

  app.get("/", (context) => {
    operation = () => honoGetCookie(context, "target");
    return context.text("ready");
  });

  await app.request("https://example.test/", {
    headers: { Cookie: cookieHeader },
  });

  if (operation === undefined) {
    throw new Error("Failed to initialize Hono cookie benchmark context");
  }

  return operation;
}

async function createHonoSignedReadOperation(
  cookieHeader: string,
): Promise<() => Promise<unknown>> {
  let operation: (() => Promise<unknown>) | undefined;
  const app = new Hono();

  app.get("/", (context) => {
    operation = () => honoGetSignedCookie(context, SECRET, "session");
    return context.text("ready");
  });

  await app.request("https://example.test/", {
    headers: { Cookie: cookieHeader },
  });

  if (operation === undefined) {
    throw new Error("Failed to initialize Hono signed-cookie benchmark context");
  }

  return operation;
}

function createCookieHeader(count: number): string {
  const pairs: string[] = [];
  const targetIndex = Math.floor(count * 0.75);

  for (let index = 0; index < count; index++) {
    if (index === targetIndex) {
      pairs.push("target=expected");
    } else {
      pairs.push(`cookie${index}=value${index}`);
    }
  }

  return pairs.join("; ");
}

function requestFromSetCookie(setCookie: string): Request {
  return new Request("https://example.test/", {
    headers: {
      Cookie: firstCookiePair(setCookie),
    },
  });
}

function firstCookiePair(setCookie: string): string {
  const separator = setCookie.indexOf(";");
  return separator === -1 ? setCookie : setCookie.slice(0, separator);
}

function consume(value: unknown): number {
  if (typeof value === "string") {
    return value.length;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (value === undefined || value === null) {
    return 0;
  }

  if (typeof value === "object" && "status" in value) {
    const status = (value as { readonly status?: unknown }).status;
    return typeof status === "string" ? status.length : 1;
  }

  return 1;
}

function readNumberArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (argument === undefined) {
    return fallback;
  }

  const value = Number(argument.slice(prefix.length));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid --${name} value`);
  }

  return value;
}

function readArg<Value extends string>(
  name: string,
  allowed: readonly Value[],
): Value {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  const value = argument?.slice(prefix.length);

  if (value === undefined || !allowed.includes(value as Value)) {
    throw new Error(`Invalid --${name} value`);
  }

  return value as Value;
}

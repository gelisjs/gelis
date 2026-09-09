import { connect } from "node:net";

import { Gelis } from "../../src/app";

interface RawHttpObservation {
  readonly statusLine: string;

  readonly headers: Record<string, string>;

  readonly body: string;
}

const app = new Gelis();

app.get(
  "/get-only",
  ({ request }) =>
    new Response(`get:${request.method}`, {
      headers: {
        "x-gelis-route": "GET",
      },
    }),
);

app.head(
  "/explicit-head",
  ({ request }) =>
    new Response(`head:${request.method}`, {
      headers: {
        "x-gelis-route": "HEAD",
      },
    }),
);

app.all(
  "/all",
  ({ request }) =>
    new Response(`all:${request.method}`, {
      headers: {
        "x-gelis-route": "ALL",
      },
    }),
);

console.log("");
console.log("P9-D2 HEAD transport probe");
console.log(`Runtime: bun ${Bun.version}`);
console.log("");

console.log("A. Request constructor");
{
  const request = new Request("http://gelis.test/probe", {
    method: "HEAD",
  });

  console.log(`requested=HEAD observed=${request.method}`);
}

console.log("");
console.log("B. Direct Gelis app.fetch()");
await observeDirect(
  "HEAD get-only",
  new Request("http://gelis.test/get-only", {
    method: "HEAD",
  }),
);

await observeDirect(
  "HEAD explicit",
  new Request("http://gelis.test/explicit-head", {
    method: "HEAD",
  }),
);

await observeDirect(
  "HEAD ALL",
  new Request("http://gelis.test/all", {
    method: "HEAD",
  }),
);

await observeDirect(
  "GET get-only",
  new Request("http://gelis.test/get-only", {
    method: "GET",
  }),
);

const server = Bun.serve({
  hostname: "127.0.0.1",

  port: 0,

  fetch(request) {
    const pathname = new URL(request.url).pathname;

    if (pathname === "/native-head") {
      return new Response(`native:${request.method}`, {
        headers: {
          "x-source": "native",
        },
      });
    }

    return app.fetch(request);
  },
});

try {
  const port = Number(server.url.port);

  console.log("");
  console.log("C. Bun fetch() -> Bun.serve()");
  await observeFetch("native HEAD", new URL("/native-head", server.url));

  await observeFetch("Gelis get-only HEAD", new URL("/get-only", server.url));

  await observeFetch(
    "Gelis explicit HEAD",
    new URL("/explicit-head", server.url),
  );

  await observeFetch("Gelis ALL HEAD", new URL("/all", server.url));

  console.log("");
  console.log("D. Raw HTTP/1.1 HEAD -> Bun.serve()");
  await observeRaw("native HEAD", port, "/native-head");

  await observeRaw("Gelis get-only HEAD", port, "/get-only");

  await observeRaw("Gelis explicit HEAD", port, "/explicit-head");

  await observeRaw("Gelis ALL HEAD", port, "/all");

  console.log("");
  console.log("Verdict: DIAGNOSTIC COMPLETE");
} finally {
  await server.stop(true);
}

async function observeDirect(
  label: string,

  request: Request,
): Promise<void> {
  const response = await app.fetch(request);

  const body = await response.text();

  console.log(
    `${label.padEnd(20)} ` +
      `status=${String(response.status).padEnd(3)} ` +
      `route=${(response.headers.get("x-gelis-route") ?? "-").padEnd(4)} ` +
      `content-length=${response.headers.get("content-length") ?? "-"} ` +
      `body=${JSON.stringify(body)}`,
  );
}

async function observeFetch(
  label: string,

  url: URL,
): Promise<void> {
  const response = await fetch(url, {
    method: "HEAD",
  });

  const body = await response.text();

  console.log(
    `${label.padEnd(20)} ` +
      `status=${String(response.status).padEnd(3)} ` +
      `route=${(
        response.headers.get("x-gelis-route") ??
        response.headers.get("x-source") ??
        "-"
      ).padEnd(6)} ` +
      `content-length=${response.headers.get("content-length") ?? "-"} ` +
      `body=${JSON.stringify(body)}`,
  );
}

async function observeRaw(
  label: string,

  port: number,

  path: string,
): Promise<void> {
  const result = await rawHttpRequest(
    port,
    [
      `HEAD ${path} HTTP/1.1`,
      `Host: 127.0.0.1:${port}`,
      "Connection: close",
      "",
      "",
    ].join("\r\n"),
  );

  console.log(
    `${label.padEnd(20)} ` +
      `status=${JSON.stringify(result.statusLine)} ` +
      `route=${(
        result.headers["x-gelis-route"] ??
        result.headers["x-source"] ??
        "-"
      ).padEnd(6)} ` +
      `content-length=${result.headers["content-length"] ?? "-"} ` +
      `wire-body=${JSON.stringify(result.body)}`,
  );
}

function rawHttpRequest(
  port: number,

  requestText: string,
): Promise<RawHttpObservation> {
  return new Promise((resolve, reject) => {
    const socket = connect(
      {
        host: "127.0.0.1",

        port,
      },

      () => {
        socket.write(requestText);
      },
    );

    const chunks: Buffer[] = [];

    socket.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });

    socket.on("error", reject);

    socket.on("end", () => {
      try {
        const response = Buffer.concat(chunks).toString("utf8");

        const separator = response.indexOf("\r\n\r\n");

        if (separator === -1) {
          throw new Error(
            `Invalid raw HTTP response: ${JSON.stringify(response)}`,
          );
        }

        const headerText = response.slice(0, separator);

        const body = response.slice(separator + 4);

        const lines = headerText.split("\r\n");

        const statusLine = lines.shift();

        if (statusLine === undefined) {
          throw new Error("Missing raw HTTP status line");
        }

        const headers: Record<string, string> = {};

        for (const line of lines) {
          const colon = line.indexOf(":");

          if (colon === -1) {
            continue;
          }

          const name = line.slice(0, colon).trim().toLowerCase();

          const value = line.slice(colon + 1).trim();

          headers[name] = value;
        }

        resolve({
          statusLine,

          headers,

          body,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

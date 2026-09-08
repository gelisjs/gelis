import { connect } from "node:net";

interface Observation {
  readonly method: string;
  readonly body: string;
  readonly path: string;
}

interface ConstructorObservation {
  readonly requested: string;
  readonly observed: string | "<rejected>";
}

interface FetchObservation {
  readonly requested: string;
  readonly observed: string | "<rejected>";
}

interface RawObservation {
  readonly requested: string;
  readonly observed: string | "<rejected>";
}

const methods = [
  "PURGE",
  "PROPFIND",
  "REPORT",
  "SEARCH",
  "M-SEARCH",
  "CHICKEN",
  "Egg",
  "eGg",
  "XTEST",
  "X-GELIS-PROBE",
  "MiXeD-Gelis",
] as const;

const forbiddenMethods = [
  "CONNECT",
  "TRACE",
  "TRACK",
  "connect",
  "TrAcE",
] as const;

const server = Bun.serve({
  hostname: "127.0.0.1",

  port: 0,

  async fetch(request) {
    return Response.json({
      method: request.method,

      body: await request.text(),

      path: new URL(request.url).pathname,
    } satisfies Observation);
  },
});

try {
  const port = Number(server.url.port);

  console.log("");
  console.log("P9-C2 custom HTTP method transport probe v2");
  console.log(`Runtime: bun ${Bun.version}`);
  console.log("");

  const constructorResults: ConstructorObservation[] = [];
  const fetchResults: FetchObservation[] = [];
  const rawResults: RawObservation[] = [];

  console.log("A. Request constructor");

  for (const method of methods) {
    let observed: ConstructorObservation["observed"];

    try {
      const request = new Request(
        new URL(`/constructor/${encodeURIComponent(method)}`, server.url),

        {
          method,

          body: `constructor:${method}`,
        },
      );

      observed = request.method;
    } catch {
      observed = "<rejected>";
    }

    constructorResults.push({
      requested: method,
      observed,
    });

    console.log(
      `${method.padEnd(16)} requested=${method.padEnd(16)} observed=${observed}`,
    );
  }

  console.log("");
  console.log("B. Bun fetch() -> Bun.serve()");

  for (const method of methods) {
    let observed: FetchObservation["observed"];

    try {
      const response = await fetch(
        new URL(`/fetch/${encodeURIComponent(method)}`, server.url),

        {
          method,

          body: `fetch:${method}`,
        },
      );

      const value = (await response.json()) as Observation;

      observed = value.method;
    } catch {
      observed = "<rejected>";
    }

    fetchResults.push({
      requested: method,
      observed,
    });

    console.log(
      `${method.padEnd(16)} requested=${method.padEnd(16)} observed=${observed}`,
    );
  }

  console.log("");
  console.log("C. Raw HTTP/1.1 -> Bun.serve()");

  for (const method of methods) {
    let observed: RawObservation["observed"];

    try {
      const body = `raw:${method}`;

      const responseBody = await rawHttpRequest(
        port,
        [
          `${method} /raw/${encodeURIComponent(method)} HTTP/1.1`,
          `Host: 127.0.0.1:${port}`,
          "Connection: close",
          "Content-Type: text/plain",
          `Content-Length: ${Buffer.byteLength(body)}`,
          "",
          body,
        ].join("\r\n"),
      );

      const value = JSON.parse(responseBody) as Observation;

      observed = value.method;
    } catch {
      observed = "<rejected>";
    }

    rawResults.push({
      requested: method,
      observed,
    });

    console.log(
      `${method.padEnd(16)} requested=${method.padEnd(16)} observed=${observed}`,
    );
  }

  console.log("");
  console.log("D. Fetch-forbidden method constructor observations");

  for (const method of forbiddenMethods) {
    let outcome = "ACCEPTED";

    try {
      new Request(server.url, {
        method,
      });
    } catch {
      outcome = "REJECTED";
    }

    console.log(`${method.padEnd(16)} ${outcome}`);
  }

  console.log("");
  console.log("E. Summary");

  const constructorDivergences = constructorResults.filter(
    (row) => row.observed !== row.requested,
  );

  const fetchDivergences = fetchResults.filter(
    (row) => row.observed !== row.requested,
  );

  const rawDivergences = rawResults.filter(
    (row) => row.observed !== row.requested,
  );

  console.log(
    `Request constructor divergences: ${constructorDivergences.length}`,
  );

  console.log(`fetch transport divergences:     ${fetchDivergences.length}`);

  console.log(`raw inbound divergences:         ${rawDivergences.length}`);

  if (constructorDivergences.length !== 0) {
    console.log("");
    console.log("Constructor divergences:");

    for (const row of constructorDivergences) {
      console.log(`  ${row.requested} -> ${row.observed}`);
    }
  }

  if (fetchDivergences.length !== 0) {
    console.log("");
    console.log("fetch() divergences:");

    for (const row of fetchDivergences) {
      console.log(`  ${row.requested} -> ${row.observed}`);
    }
  }

  if (rawDivergences.length !== 0) {
    console.log("");
    console.log("Raw inbound divergences:");

    for (const row of rawDivergences) {
      console.log(`  ${row.requested} -> ${row.observed}`);
    }
  }

  console.log("");
  console.log("Verdict: DIAGNOSTIC COMPLETE");
} finally {
  await server.stop(true);
}

function rawHttpRequest(
  port: number,

  requestText: string,
): Promise<string> {
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
      const response = Buffer.concat(chunks).toString("utf8");

      const separator = response.indexOf("\r\n\r\n");

      if (separator === -1) {
        reject(
          new Error(`Invalid raw HTTP response: ${JSON.stringify(response)}`),
        );

        return;
      }

      const headers = response.slice(0, separator);

      if (!headers.startsWith("HTTP/1.1 200")) {
        reject(
          new Error(`Unexpected raw HTTP status: ${headers.split("\r\n")[0]}`),
        );

        return;
      }

      resolve(
        decodeResponseBody(
          headers,

          response.slice(separator + 4),
        ),
      );
    });
  });
}

function decodeResponseBody(
  headers: string,

  body: string,
): string {
  if (!/\btransfer-encoding:\s*chunked\b/i.test(headers)) {
    return body;
  }

  let offset = 0;
  let decoded = "";

  while (offset < body.length) {
    const lineEnd = body.indexOf("\r\n", offset);

    if (lineEnd === -1) {
      throw new Error("Invalid chunked response");
    }

    const size = Number.parseInt(body.slice(offset, lineEnd), 16);

    if (!Number.isFinite(size)) {
      throw new Error("Invalid chunk size");
    }

    if (size === 0) {
      return decoded;
    }

    const start = lineEnd + 2;
    const end = start + size;

    decoded += body.slice(start, end);

    offset = end + 2;
  }

  throw new Error("Incomplete chunked response");
}

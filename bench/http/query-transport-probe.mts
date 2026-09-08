interface QueryObservation {
  readonly method: string;
  readonly pathname: string;
  readonly body: string;
  readonly contentType: string | null;
  readonly probeHeader: string | null;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const payload = JSON.stringify({
  q: "gelis",
  limit: 3,
});

/*
 * Probe 1:
 *
 * Verify that Bun's Web Standards Request implementation
 * accepts QUERY as a body-bearing HTTP method.
 */
const constructedRequest = new Request("http://localhost/query", {
  method: "QUERY",

  headers: {
    "content-type": "application/json",
  },

  body: payload,
});

invariant(
  constructedRequest.method === "QUERY",
  `Request constructor changed QUERY to ${constructedRequest.method}`,
);

invariant(
  (await constructedRequest.clone().text()) === payload,
  "Request constructor did not preserve QUERY request content",
);

/*
 * Probe 2:
 *
 * Verify the complete Bun fetch -> Bun.serve transport path.
 *
 * This intentionally does not involve Gelis.
 */
let serverReceivedRequest = false;

const server = Bun.serve({
  hostname: "127.0.0.1",

  port: 0,

  async fetch(request) {
    serverReceivedRequest = true;

    const observation: QueryObservation = {
      method: request.method,

      pathname: new URL(request.url).pathname,

      body: await request.text(),

      contentType: request.headers.get("content-type"),

      probeHeader: request.headers.get("x-gelis-query-probe"),
    };

    return Response.json(observation);
  },
});

try {
  const response = await fetch(new URL("/query", server.url), {
    method: "QUERY",

    headers: {
      "content-type": "application/json",

      "x-gelis-query-probe": "p9-b1",
    },

    body: payload,
  });

  invariant(
    response.status === 200,
    `QUERY transport returned HTTP ${response.status}`,
  );

  const observation = (await response.json()) as QueryObservation;

  invariant(
    serverReceivedRequest,
    "Bun.serve did not receive the QUERY request",
  );

  invariant(
    observation.method === "QUERY",
    `Bun.serve observed method ${observation.method} instead of QUERY`,
  );

  invariant(
    observation.pathname === "/query",
    `Bun.serve observed unexpected pathname ${observation.pathname}`,
  );

  invariant(
    observation.body === payload,
    "Bun.serve did not preserve QUERY request content",
  );

  invariant(
    observation.contentType === "application/json",
    `Unexpected content-type: ${observation.contentType}`,
  );

  invariant(
    observation.probeHeader === "p9-b1",
    "Custom request header was not preserved",
  );

  console.log("");
  console.log("P9-B1 QUERY transport probe");
  console.log(`Runtime:                bun ${Bun.version}`);
  console.log(`Request method:         ${constructedRequest.method}`);
  console.log("Request body:           PASS");
  console.log(`Bun.serve method:       ${observation.method}`);
  console.log("Bun.serve body:         PASS");
  console.log(`Bun.serve pathname:     ${observation.pathname}`);
  console.log(`HTTP response:          ${response.status}`);
  console.log("");
  console.log("Verdict: PASS");
} finally {
  await server.stop(true);
}

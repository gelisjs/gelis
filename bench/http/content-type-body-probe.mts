const results: Array<Record<string, unknown>> = [];

await probe("duplicate-content-type", async () => {
  const headers = new Headers();

  headers.append("content-type", "application/json");

  headers.append("content-type", "text/plain");

  return {
    get: headers.get("content-type"),
    entries: [...headers.entries()],
  };
});

await probe("json-with-structured-content-type", async () => {
  const request = new Request("http://gelis.test/", {
    method: "POST",

    headers: {
      "content-type": "application/problem+json",
    },

    body: JSON.stringify({
      ok: true,
    }),
  });

  return {
    contentType: request.headers.get("content-type"),

    value: await request.json(),

    bodyUsed: request.bodyUsed,
  };
});

await probe("json-with-charset-parameter", async () => {
  const request = new Request("http://gelis.test/", {
    method: "POST",

    headers: {
      "content-type": "application/json; charset=utf-8",
    },

    body: JSON.stringify({
      ok: true,
    }),
  });

  return {
    contentType: request.headers.get("content-type"),

    value: await request.json(),
  };
});

await probe("urlencoded-form-data", async () => {
  const request = new Request("http://gelis.test/", {
    method: "POST",

    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },

    body: "name=gelis&tag=a&tag=b&space=hello+world",
  });

  const form = await request.formData();

  return {
    entries: [...form.entries()].map(([key, value]) => [key, value]),

    tagAll: form.getAll("tag"),
  };
});

await probe("multipart-form-data", async () => {
  const form = new FormData();

  form.append("name", "gelis");

  form.append("tag", "a");

  form.append("tag", "b");

  form.append(
    "file",
    new File(["hello"], "hello.txt", {
      type: "text/plain",
    }),
  );

  const request = new Request("http://gelis.test/", {
    method: "POST",
    body: form,
  });

  const parsed = await request.formData();

  const file = parsed.get("file");

  return {
    contentType: request.headers.get("content-type"),

    name: parsed.get("name"),

    tagAll: parsed.getAll("tag"),

    file:
      file instanceof File
        ? {
            name: file.name,
            size: file.size,
            type: file.type,
          }
        : file,
  };
});

await probe("multipart-missing-boundary", async () => {
  const request = new Request("http://gelis.test/", {
    method: "POST",

    headers: {
      "content-type": "multipart/form-data",
    },

    body: "broken",
  });

  try {
    await request.formData();

    return {
      resolved: true,
    };
  } catch (error) {
    return {
      resolved: false,

      error: serializeError(error),
    };
  }
});

await probe("text", async () => {
  const request = new Request("http://gelis.test/", {
    method: "POST",

    headers: {
      "content-type": "text/plain; charset=utf-8",
    },

    body: "hello",
  });

  return {
    value: await request.text(),
  };
});

await probe("array-buffer", async () => {
  const request = new Request("http://gelis.test/", {
    method: "POST",

    headers: {
      "content-type": "application/octet-stream",
    },

    body: new Uint8Array([1, 2, 3, 255]),
  });

  return {
    bytes: [...new Uint8Array(await request.arrayBuffer())],
  };
});

await probe("response-json-custom-content-type", async () => {
  const response = Response.json(
    {
      ok: true,
    },

    {
      headers: {
        "content-type": "application/problem+json",
      },
    },
  );

  return {
    contentType: response.headers.get("content-type"),

    body: await response.text(),
  };
});

await probe("response-string-default-content-type", async () => {
  const response = new Response("hello");

  return {
    contentType: response.headers.get("content-type"),
  };
});

console.log("\nP9-E Bun content-type / body probe\n");

console.table(
  results.map(({ name, status, ...rest }) => ({
    name,
    status,
    detail: JSON.stringify(rest),
  })),
);

console.log("\nRaw JSON\n");

console.log(JSON.stringify(results, null, 2));

async function probe(
  name: string,
  run: () => unknown | Promise<unknown>,
): Promise<void> {
  try {
    results.push({
      name,
      status: "PASS",
      result: await run(),
    });
  } catch (error) {
    results.push({
      name,
      status: "ERROR",
      error: serializeError(error),
    });
  }
}

function serializeError(error: unknown): {
  name: string;
  message: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: typeof error,
    message: String(error),
  };
}

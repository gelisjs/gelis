const entry = process.env.ENTRY;

if (!entry) {
  throw new Error("Missing ENTRY");
}

const started = performance.now();

const result = await Bun.build({
  entrypoints: [entry],

  target: "bun",

  format: "esm",

  minify: false,

  sourcemap: "none",

  throw: false,
});

const buildMs = performance.now() - started;

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }

  throw new Error("Bun build failed");
}

let outputBytes = 0;

for (const output of result.outputs) {
  outputBytes += output.size;
}

console.log(
  JSON.stringify({
    buildMs,

    outputBytes,

    outputCount: result.outputs.length,
  }),
);

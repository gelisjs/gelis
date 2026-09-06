const CASE = process.env.CASE ?? "query-sync";

const supportedCases = new Set([
  "query-sync",
  "query-async",
  "body-sync",
  "query-body",
]);

if (!supportedCases.has(CASE)) {
  throw new Error(`Unknown Elysia 2 AOT validation case: ${CASE}`);
}

await import(
  `../../elysia-v2-aot/generated/validation/${CASE}/validation-server.js`
);

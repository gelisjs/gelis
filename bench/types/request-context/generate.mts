import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const SIZES = [100, 500, 1000, 5000] as const;

type BenchmarkSize = (typeof SIZES)[number];

const ROUTES_PER_FILE = 50;

const GENERATED = new URL("../generated/request-context/", import.meta.url);

const SCENARIOS = [
  "ordinary-plain",
  "application-context-plain",
  "request-context-plain",
  "ordinary-rich",
  "request-context-rich",
] as const;

type Scenario = (typeof SCENARIOS)[number];

rmSync(GENERATED, {
  recursive: true,
  force: true,
});

mkdirSync(GENERATED, {
  recursive: true,
});

for (const size of SIZES) {
  for (const scenario of SCENARIOS) {
    generateCase(scenario, size);
  }
}

function generateCase(scenario: Scenario, size: BenchmarkSize): void {
  const directory = caseDir(scenario, size);

  writeModel(directory, scenario);

  writeRouteFiles(directory, scenario, size);
}

function caseDir(scenario: Scenario, size: BenchmarkSize): URL {
  const directory = new URL(`./${scenario}-${size}/`, GENERATED);

  mkdirSync(directory, {
    recursive: true,
  });

  writeTsconfig(directory);

  return directory;
}

function writeTsconfig(directory: URL): void {
  const config = {
    extends: "../../../../../tsconfig.json",

    compilerOptions: {
      noEmit: true,
      incremental: false,
    },

    include: ["./**/*.ts"],
  };

  writeFileSync(
    new URL("tsconfig.json", directory),

    `${JSON.stringify(config, null, 2)}\n`,
  );
}

function writeModel(directory: URL, scenario: Scenario): void {
  const lines: string[] = ['import { Gelis } from "../../../../../src"', ""];

  if (scenario === "ordinary-rich" || scenario === "request-context-rich") {
    lines.push(
      'import type { StandardSchemaV1 } from "../../../../../src"',
      "",
      "export declare const Query: StandardSchemaV1<",
      "  Record<string, string | string[]>,",
      "  { readonly page: number }",
      ">",
      "",
      "export declare const Body: StandardSchemaV1<",
      "  { readonly name: string },",
      "  { readonly name: string; readonly normalized: true }",
      ">",
      "",
      "export declare const Output: StandardSchemaV1<",
      "  {",
      "    readonly id: string",
      "    readonly page: number",
      "    readonly name: string",
      "    readonly scope: string",
      "  },",
      "  {",
      "    readonly id: string",
      "    readonly page: number",
      "    readonly name: string",
      "    readonly scope: string",
      "    readonly serialized: true",
      "  }",
      ">",
      "",
    );
  }

  lines.push(
    "export const app = new Gelis()",
    "",
    "type RootBefore = typeof app",
    "",
  );

  if (scenario === "application-context-plain") {
    lines.push(
      "export const routes = app.scope({",
      '  tenant: "primary",',
      "} as const)",
      "",
    );
  } else if (
    scenario === "request-context-plain" ||
    scenario === "request-context-rich"
  ) {
    lines.push(
      "export const routes = app.requestScope(",
      "  ({ request }) => ({",
      "    tenant: request.method,",
      "  }),",
      ")",
      "",
    );
  }

  lines.push(
    "type RootAfter = typeof app",
    "",
    "type RootStable =",
    "  [RootBefore] extends [RootAfter]",
    "    ? [RootAfter] extends [RootBefore]",
    "      ? true",
    "      : false",
    "    : false",
    "",
    "const rootStable: RootStable = true",
    "void rootStable",
    "",
  );

  writeFileSync(
    new URL("model.ts", directory),

    `${lines.join("\n")}\n`,
  );
}

function writeRouteFiles(
  directory: URL,
  scenario: Scenario,
  size: BenchmarkSize,
): void {
  const imports: string[] = [];

  for (const [fileIndex, chunk] of routeChunks(size).entries()) {
    const name = `routes-${String(fileIndex).padStart(3, "0")}.ts`;

    imports.push(`import "./${name.replace(/\.ts$/, "")}"`);

    const lines: string[] = [];

    if (scenario === "ordinary-rich") {
      lines.push('import { app, Body, Output, Query } from "./model"', "");
    } else if (scenario === "request-context-rich") {
      lines.push('import { Body, Output, Query, routes } from "./model"', "");
    } else if (scenario === "ordinary-plain") {
      lines.push('import { app } from "./model"', "");
    } else {
      lines.push('import { routes } from "./model"', "");
    }

    for (let route = chunk.start; route < chunk.end; route++) {
      writeRoute(lines, scenario, route);
    }

    writeFileSync(
      new URL(name, directory),

      `${lines.join("\n")}\n`,
    );
  }

  writeFileSync(
    new URL("index.ts", directory),

    `${imports.join("\n")}\n`,
  );
}

function writeRoute(lines: string[], scenario: Scenario, route: number): void {
  const path = `/r/${route}/:id`;

  if (scenario === "ordinary-plain") {
    lines.push(`app.get("${path}", ({ params }) => params.id)`);

    return;
  }

  if (
    scenario === "application-context-plain" ||
    scenario === "request-context-plain"
  ) {
    lines.push(
      `routes.get("${path}", ({ params }, scope) => params.id + scope.tenant)`,
    );

    return;
  }

  const target = scenario === "ordinary-rich" ? "app" : "routes";

  const handlerParameters =
    scenario === "ordinary-rich"
      ? "({ params, query, body })"
      : "({ params, query, body }, scope)";

  const scopeExpression =
    scenario === "ordinary-rich" ? '"ordinary"' : "scope.tenant";

  lines.push(
    `${target}.post(`,
    `  "${path}",`,
    "  {",
    "    query: Query,",
    "    body: Body,",
    "    responses: {",
    "      200: {",
    "        schema: Output,",
    "        validate: true,",
    "      },",
    "    },",
    "  },",
    `  ${handlerParameters} => ({`,
    "    id: params.id,",
    "    page: query.page,",
    "    name: body.name,",
    `    scope: ${scopeExpression},`,
    "  }),",
    "  {",
  );

  if (scenario === "ordinary-rich") {
    lines.push(
      "    beforeHandle({ query, body }) {",
      "      void query.page",
      "      void body.normalized",
      "    },",
      "    afterHandle(_context, result) {",
      "      void result",
      "    },",
    );
  } else {
    lines.push(
      "    beforeHandle({ query, body }, scope) {",
      "      void query.page",
      "      void body.normalized",
      "      void scope.tenant",
      "    },",
      "    afterHandle(_context, result, scope) {",
      "      void result",
      "      void scope.tenant",
      "    },",
    );
  }

  lines.push("  },", ")");
}

function routeChunks(size: BenchmarkSize): Array<{
  start: number;
  end: number;
}> {
  const chunks: Array<{
    start: number;
    end: number;
  }> = [];

  for (let start = 0; start < size; start += ROUTES_PER_FILE) {
    chunks.push({
      start,

      end: Math.min(start + ROUTES_PER_FILE, size),
    });
  }

  return chunks;
}

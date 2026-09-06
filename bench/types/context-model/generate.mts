import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const SIZES = [100, 500, 1000, 5000] as const;

type BenchmarkSize = (typeof SIZES)[number];

const CAPABILITIES = 32;

const ROUTES_PER_FILE = 50;

const GENERATED = new URL("./generated/", import.meta.url);

rmSync(GENERATED, {
  recursive: true,
  force: true,
});

mkdirSync(GENERATED, {
  recursive: true,
});

for (const size of SIZES) {
  generateBaseline(size);
  generateRootGeneric(size);
  generateScopedBuilder(size);
  generateCapabilityToken(size);
}

function caseDir(name: string, size: BenchmarkSize): URL {
  const directory = new URL(`./generated/${name}-${size}/`, import.meta.url);

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

function capabilityTypeLines(): string[] {
  const lines = ["export interface Capabilities {"];

  for (let index = 0; index < CAPABILITIES; index++) {
    lines.push(
      `  readonly cap${index}: { readonly id: ${index}; readonly value: string }`,
    );
  }

  lines.push("}", "");

  return lines;
}

function selectedCapabilities(route: number): number[] {
  return [
    route % CAPABILITIES,
    (route + 7) % CAPABILITIES,
    (route + 13) % CAPABILITIES,
    (route + 23) % CAPABILITIES,
  ];
}

function generateBaseline(size: BenchmarkSize): void {
  const directory = caseDir("baseline", size);

  writeFileSync(
    new URL("model.ts", directory),

    [
      "export interface BaseContext {",
      "  readonly request: Request",
      "}",
      "",
      "export class App {",
      "  get(",
      "    path: string,",
      "    handler: (context: BaseContext) => unknown,",
      "  ): void {",
      "    void path",
      "    void handler",
      "  }",
      "}",
      "",
      "export const app = new App()",
      "",
    ].join("\n"),
  );

  writeRouteFiles(directory, size, "baseline");
}

function generateRootGeneric(size: BenchmarkSize): void {
  const directory = caseDir("root-generic", size);

  const lines = [
    "export interface BaseContext {",
    "  readonly request: Request",
    "}",
    "",
    ...capabilityTypeLines(),
    "type Merge<A extends object, B extends object> = A & B",
    "",
    "export class App<Context extends object = {}> {",
    "  extend<const Added extends object>(",
    "    values: Added,",
    "  ): App<Merge<Context, Added>> {",
    "    void values",
    "    return this as unknown as App<Merge<Context, Added>>",
    "  }",
    "",
    "  get(",
    "    path: string,",
    "    handler: (context: BaseContext & Context) => unknown,",
    "  ): void {",
    "    void path",
    "    void handler",
    "  }",
    "}",
    "",
    "const base = new App()",
    "",
    "export const capabilityValues: Capabilities = {",
  ];

  for (let index = 0; index < CAPABILITIES; index++) {
    lines.push(`  cap${index}: { id: ${index}, value: "cap${index}" },`);
  }

  lines.push(
    "}",
    "",
    "export const app = base.extend(capabilityValues)",
    "",
    "// Correctness gate: invalid capability values must remain rejected.",
    "// @ts-expect-error cap0 requires literal id 0",
    "const invalidCapability: Capabilities['cap0'] = { id: 999, value: 'invalid' }",
    "void invalidCapability",
    "",
    "type CapabilityCheck = typeof app extends App<Capabilities> ? true : false",
    "const capabilityCheck: CapabilityCheck = true",
    "void capabilityCheck",
    "",
  );

  writeFileSync(
    new URL("model.ts", directory),

    lines.join("\n"),
  );

  writeRouteFiles(directory, size, "root-generic");
}

function generateScopedBuilder(size: BenchmarkSize): void {
  const directory = caseDir("scoped-builder", size);

  const lines = [
    "export interface BaseContext {",
    "  readonly request: Request",
    "}",
    "",
    ...capabilityTypeLines(),
    "export class ScopedBuilder<Context extends object> {",
    "  get(",
    "    path: string,",
    "    handler: (context: BaseContext & Context) => unknown,",
    "  ): void {",
    "    void path",
    "    void handler",
    "  }",
    "}",
    "",
    "export class App {",
    "  context<const Context extends object>(",
    "    values: Context,",
    "  ): ScopedBuilder<Context> {",
    "    void values",
    "    return new ScopedBuilder<Context>()",
    "  }",
    "",
    "  get(",
    "    path: string,",
    "    handler: (context: BaseContext) => unknown,",
    "  ): void {",
    "    void path",
    "    void handler",
    "  }",
    "}",
    "",
    "export const app = new App()",
    "",
    "type RootBefore = typeof app",
    "",
    "export const capabilityValues: Capabilities = {",
  ];

  for (let index = 0; index < CAPABILITIES; index++) {
    lines.push(`  cap${index}: { id: ${index}, value: "cap${index}" },`);
  }

  lines.push(
    "}",
    "",
    "export const routes = app.context(capabilityValues)",
    "",
    "// Correctness gate: invalid capability values must remain rejected.",
    "// @ts-expect-error cap0 requires literal id 0",
    "const invalidCapability: Capabilities['cap0'] = { id: 999, value: 'invalid' }",
    "void invalidCapability",
    "",
    "type RootAfter = typeof app",
    "type RootStable = [RootBefore] extends [RootAfter]",
    "  ? [RootAfter] extends [RootBefore]",
    "    ? true",
    "    : false",
    "  : false",
    "const rootStable: RootStable = true",
    "void rootStable",
    "",
  );

  writeFileSync(
    new URL("model.ts", directory),

    lines.join("\n"),
  );

  writeRouteFiles(directory, size, "scoped-builder");
}

function generateCapabilityToken(size: BenchmarkSize): void {
  const directory = caseDir("capability-token", size);

  const lines = [
    "export interface BaseContext {",
    "  readonly request: Request",
    "}",
    "",
    "declare const capabilityType: unique symbol",
    "",
    "export interface Capability<Value> {",
    "  readonly name: string",
    "  readonly [capabilityType]?: Value",
    "}",
    "",
    "export type CapabilityValue<Token> =",
    "  Token extends Capability<infer Value>",
    "    ? Value",
    "    : never",
    "",
    "export function defineCapability<Value>(",
    "  name: string,",
    "): Capability<Value> {",
    "  return { name }",
    "}",
    "",
    "export interface CapabilityContext extends BaseContext {",
    "  use<const Token extends Capability<unknown>>(",
    "    token: Token,",
    "  ): CapabilityValue<Token>",
    "}",
    "",
    "export class App {",
    "  provide<const Token extends Capability<unknown>>(",
    "    token: Token,",
    "    value: CapabilityValue<Token>,",
    "  ): void {",
    "    void token",
    "    void value",
    "  }",
    "",
    "  get(",
    "    path: string,",
    "    handler: (context: CapabilityContext) => unknown,",
    "  ): void {",
    "    void path",
    "    void handler",
    "  }",
    "}",
    "",
    "export const app = new App()",
    "",
  ];

  for (let index = 0; index < CAPABILITIES; index++) {
    lines.push(
      `export const cap${index} = defineCapability<{ readonly id: ${index}; readonly value: string }>("cap${index}")`,
      `app.provide(cap${index}, { id: ${index}, value: "cap${index}" })`,
    );
  }

  lines.push(
    "",
    "// Correctness gate: provide() must derive the value type from the token.",
    "// @ts-expect-error cap0 requires literal id 0",
    "app.provide(cap0, { id: 999, value: 'invalid' })",
    "",
    "type RootAfterProvides = typeof app",
    "void (null as unknown as RootAfterProvides)",
    "",
  );

  writeFileSync(
    new URL("model.ts", directory),

    lines.join("\n"),
  );

  writeRouteFiles(directory, size, "capability-token");
}

function writeRouteFiles(
  directory: URL,
  size: BenchmarkSize,
  model: "baseline" | "root-generic" | "scoped-builder" | "capability-token",
): void {
  const imports: string[] = [];

  for (const [fileIndex, chunk] of routeChunks(size).entries()) {
    const name = `routes-${String(fileIndex).padStart(3, "0")}.ts`;

    imports.push(`import './${name.replace(/\.ts$/, "")}'`);

    const lines: string[] = [];

    if (model === "baseline") {
      lines.push("import { app } from './model'", "");
    } else if (model === "root-generic") {
      lines.push("import { app } from './model'", "");
    } else if (model === "scoped-builder") {
      lines.push("import { routes } from './model'", "");
    } else {
      const used = new Set<number>();

      for (let route = chunk.start; route < chunk.end; route++) {
        for (const capability of selectedCapabilities(route)) {
          used.add(capability);
        }
      }

      lines.push(
        `import { app, ${[...used]
          .sort((left, right) => left - right)
          .map((index) => `cap${index}`)
          .join(", ")} } from './model'`,
        "",
      );
    }

    for (let route = chunk.start; route < chunk.end; route++) {
      if (model === "baseline") {
        lines.push(`app.get('/r/${route}', ({ request }) => request.method)`);

        continue;
      }

      const [first, second, third, fourth] = selectedCapabilities(route);

      if (
        first === undefined ||
        second === undefined ||
        third === undefined ||
        fourth === undefined
      ) {
        throw new Error("Missing generated capability index");
      }

      if (model === "root-generic" || model === "scoped-builder") {
        const target = model === "root-generic" ? "app" : "routes";

        lines.push(
          `${target}.get('/r/${route}', ({ cap${first}, cap${second}, cap${third}, cap${fourth} }) => ` +
            `cap${first}.value + cap${second}.value + cap${third}.value + cap${fourth}.value)`,
        );

        continue;
      }

      lines.push(
        `app.get('/r/${route}', (context) => {`,
        `  const a = context.use(cap${first})`,
        `  const b = context.use(cap${second})`,
        `  const c = context.use(cap${third})`,
        `  const d = context.use(cap${fourth})`,
        `  return a.value + b.value + c.value + d.value`,
        `})`,
      );
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

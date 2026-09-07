import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const SIZES = [100, 5_000] as const;

type BenchmarkSize = (typeof SIZES)[number];

const UNITS_PER_FILE = 50;

const SCENARIOS = [
  "direct-route-control",
  "define-module-overloads",
  "narrow-static-signature",
] as const;

type Scenario = (typeof SCENARIOS)[number];

const GENERATED = new URL(
  "../generated/module-define-overload-cost/",
  import.meta.url,
);

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
  const directory = caseDirectory(scenario, size);

  if (scenario === "narrow-static-signature") {
    writeNarrowHelper(directory);
  }

  const chunkCount = Math.ceil(size / UNITS_PER_FILE);

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    const start = chunkIndex * UNITS_PER_FILE;

    const end = Math.min(size, start + UNITS_PER_FILE);

    writeChunk(directory, scenario, chunkIndex, start, end);
  }

  writeIndex(directory, scenario, chunkCount);
}

function caseDirectory(scenario: Scenario, size: BenchmarkSize): URL {
  const directory = new URL(`./${scenario}-${size}/`, GENERATED);

  mkdirSync(directory, {
    recursive: true,
  });

  writeFileSync(
    new URL("tsconfig.json", directory),

    `${JSON.stringify(
      {
        extends: "../../../../../tsconfig.json",

        compilerOptions: {
          noEmit: true,
          incremental: false,
        },

        include: ["./**/*.ts"],
      },

      null,
      2,
    )}\n`,
  );

  return directory;
}

function writeNarrowHelper(directory: URL): void {
  writeFileSync(
    new URL("narrow.ts", directory),

    `import type {
  ModuleRef,
  ModuleRouteBuilder,
  ModuleRoutes,
} from "../../../../../src/module"

import type {
  ValidRoutePath,
} from "../../../../../src/types/path"

/*
 * Diagnostic-only signature.
 *
 * This is intentionally the same static two-argument type contract as the
 * corresponding defineModule overload, but without the other overloads.
 *
 * No runtime implementation is needed because this benchmark only invokes
 * TypeScript.
 */
export declare function defineStaticModule<
  const Prefix extends string,
  const Routes extends ModuleRoutes,
>(
  prefix:
    Prefix &
    ValidRoutePath<Prefix>,

  define:
    (
      route:
        ModuleRouteBuilder<Prefix>,
    ) => Routes,
): ModuleRef<
  Prefix,
  Routes
>
`,
  );
}

function writeChunk(
  directory: URL,
  scenario: Scenario,
  chunkIndex: number,
  start: number,
  end: number,
): void {
  const lines: string[] = [];

  if (scenario === "direct-route-control") {
    lines.push(
      'import type { Gelis } from "../../../../../src"',
      "",
      `export function applyChunk${chunkIndex}(app: Gelis): void {`,
    );

    for (let index = start; index < end; index++) {
      lines.push(
        "  app.get(",
        `    "/m/${index}",`,
        "",
        `    () => ${index} as const,`,
        "  )",
        "",
      );
    }

    lines.push("}", "");
  } else {
    if (scenario === "define-module-overloads") {
      lines.push('import { defineModule } from "../../../../../src"', "");
    } else {
      lines.push('import { defineStaticModule } from "./narrow"', "");
    }

    const callee =
      scenario === "define-module-overloads"
        ? "defineModule"
        : "defineStaticModule";

    for (let index = start; index < end; index++) {
      lines.push(
        `const module${index} = ${callee}(`,
        `  "/m/${index}",`,
        "",
        "  (route) => ({",
        "    read:",
        "      route.get(",
        '        "/",',
        "",
        `        () => ${index} as const,`,
        "      ),",
        "  }),",
        ")",
        "",
        `void module${index}`,
        "",
      );
    }

    lines.push(`export const chunk${chunkIndex} = true`, "");
  }

  writeFileSync(
    new URL(`chunk-${chunkIndex}.ts`, directory),

    `${lines.join("\n")}\n`,
  );
}

function writeIndex(
  directory: URL,
  scenario: Scenario,
  chunkCount: number,
): void {
  const lines = ['import { Gelis } from "../../../../../src"', ""];

  if (scenario === "direct-route-control") {
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
      lines.push(
        `import { applyChunk${chunkIndex} } from "./chunk-${chunkIndex}"`,
      );
    }

    lines.push("", "const app = new Gelis()", "");

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
      lines.push(`applyChunk${chunkIndex}(app)`);
    }
  } else {
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
      lines.push(`import { chunk${chunkIndex} } from "./chunk-${chunkIndex}"`);
    }

    lines.push("", "const app = new Gelis()", "");

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
      lines.push(`void chunk${chunkIndex}`);
    }
  }

  lines.push(
    "",
    "type Equal<Left, Right> =",
    "  (<Type>() => Type extends Left ? 1 : 2) extends",
    "  (<Type>() => Type extends Right ? 1 : 2)",
    "    ? true",
    "    : false",
    "",
    "type Expect<Value extends true> = Value",
    "",
    "type StableRoot = Expect<",
    "  Equal<typeof app, Gelis>",
    ">",
    "",
    "export type { StableRoot }",
    "",
  );

  writeFileSync(
    new URL("index.ts", directory),

    `${lines.join("\n")}\n`,
  );
}

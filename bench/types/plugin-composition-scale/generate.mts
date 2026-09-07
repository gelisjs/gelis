import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const SIZES = [100, 500, 1_000, 5_000] as const;

type BenchmarkSize = (typeof SIZES)[number];

const UNITS_PER_FILE = 50;

const SCENARIOS = ["direct-composition-control", "plugin-composition"] as const;

type Scenario = (typeof SCENARIOS)[number];

const GENERATED = new URL(
  "../generated/plugin-composition-scale/",
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

  const chunkCount = Math.ceil(size / UNITS_PER_FILE);

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    const start = chunkIndex * UNITS_PER_FILE;

    const end = Math.min(size, start + UNITS_PER_FILE);

    writeChunk(directory, scenario, chunkIndex, start, end);
  }

  writeIndex(directory, chunkCount);
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

function writeChunk(
  directory: URL,
  scenario: Scenario,
  chunkIndex: number,
  start: number,
  end: number,
): void {
  const lines: string[] = [];

  if (scenario === "plugin-composition") {
    lines.push(
      'import { definePlugin } from "../../../../../src"',
      "",
      'import type { Gelis } from "../../../../../src"',
      "",
    );

    for (let index = start; index < end; index++) {
      lines.push(...pluginDefinition(index));
    }

    lines.push(`export function applyChunk${chunkIndex}(app: Gelis): void {`);

    for (let index = start; index < end; index++) {
      lines.push(`  app.use(plugin${index})`);
    }

    lines.push("}", "");
  } else {
    lines.push(
      'import type { Gelis } from "../../../../../src"',
      "",
      `export function applyChunk${chunkIndex}(app: Gelis): void {`,
    );

    for (let index = start; index < end; index++) {
      lines.push(...directComposition(index, "  "));
    }

    lines.push("}", "");
  }

  writeFileSync(
    new URL(`chunk-${chunkIndex}.ts`, directory),

    `${lines.join("\n")}\n`,
  );
}

function pluginDefinition(index: number): string[] {
  return [
    `const plugin${index} = definePlugin(`,
    `  "plugin-${index}",`,
    "",
    "  (setup) => {",
    ...pluginComposition(index, "    "),
    "  },",
    ")",
    "",
  ];
}

function directComposition(index: number, indent: string): string[] {
  switch (index % 5) {
    case 0:
      return [
        `${indent}app.get(`,
        `${indent}  "/route/${index}",`,
        "",
        `${indent}  () => ${index},`,
        `${indent})`,
        "",
      ];

    case 1:
      return [
        `${indent}const scope${index} =`,
        `${indent}  app.scope({`,
        `${indent}    value: ${index} as const,`,
        `${indent}  })`,
        "",
        `${indent}scope${index}.get(`,
        `${indent}  "/scope/${index}",`,
        "",
        `${indent}  (_context, scope) =>`,
        `${indent}    scope.value,`,
        `${indent})`,
        "",
      ];

    case 2:
      return [
        `${indent}const requestScope${index} =`,
        `${indent}  app.requestScope(`,
        `${indent}    () => ({`,
        `${indent}      value: ${index} as const,`,
        `${indent}    }),`,
        `${indent}  )`,
        "",
        `${indent}requestScope${index}.get(`,
        `${indent}  "/request-scope/${index}",`,
        "",
        `${indent}  (_context, scope) =>`,
        `${indent}    scope.value,`,
        `${indent})`,
        "",
      ];

    case 3:
      return [
        `${indent}app.onBeforeHandle(`,
        `${indent}  () => undefined,`,
        `${indent})`,
        "",
        `${indent}app.onAfterHandle(`,
        `${indent}  () => undefined,`,
        `${indent})`,
        "",
      ];

    default:
      return [
        `${indent}app.onRequest(`,
        `${indent}  () => undefined,`,
        `${indent})`,
        "",
        `${indent}app.onError(`,
        `${indent}  () => undefined,`,
        `${indent})`,
        "",
      ];
  }
}

function pluginComposition(index: number, indent: string): string[] {
  switch (index % 5) {
    case 0:
      return [
        `${indent}setup.routes.get(`,
        `${indent}  "/route/${index}",`,
        "",
        `${indent}  () => ${index},`,
        `${indent})`,
      ];

    case 1:
      return [
        `${indent}const scope =`,
        `${indent}  setup.scope({`,
        `${indent}    value: ${index} as const,`,
        `${indent}  })`,
        "",
        `${indent}scope.get(`,
        `${indent}  "/scope/${index}",`,
        "",
        `${indent}  (_context, scope) =>`,
        `${indent}    scope.value,`,
        `${indent})`,
      ];

    case 2:
      return [
        `${indent}const requestScope =`,
        `${indent}  setup.requestScope(`,
        `${indent}    () => ({`,
        `${indent}      value: ${index} as const,`,
        `${indent}    }),`,
        `${indent}  )`,
        "",
        `${indent}requestScope.get(`,
        `${indent}  "/request-scope/${index}",`,
        "",
        `${indent}  (_context, scope) =>`,
        `${indent}    scope.value,`,
        `${indent})`,
      ];

    case 3:
      return [
        `${indent}setup.onBeforeHandle(`,
        `${indent}  () => undefined,`,
        `${indent})`,
        "",
        `${indent}setup.onAfterHandle(`,
        `${indent}  () => undefined,`,
        `${indent})`,
      ];

    default:
      return [
        `${indent}setup.onRequest(`,
        `${indent}  () => undefined,`,
        `${indent})`,
        "",
        `${indent}setup.onError(`,
        `${indent}  () => undefined,`,
        `${indent})`,
      ];
  }
}

function writeIndex(directory: URL, chunkCount: number): void {
  const lines = ['import { Gelis } from "../../../../../src"', ""];

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    lines.push(
      `import { applyChunk${chunkIndex} } from "./chunk-${chunkIndex}"`,
    );
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
    "const app = new Gelis()",
    "",
  );

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    lines.push(`applyChunk${chunkIndex}(app)`);
  }

  lines.push(
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

import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const SIZES = [100, 5_000] as const;

type BenchmarkSize = (typeof SIZES)[number];

const UNITS_PER_FILE = 50;

const SCENARIOS = [
  "direct-route-control",
  "module-unnamed-mounted",
  "module-named-unmounted",
  "module-named-mounted",
  "module-erased-named-mounted",
] as const;

type Scenario = (typeof SCENARIOS)[number];

const GENERATED = new URL(
  "../generated/module-contract-retention/",
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
        `  app.get(`,
        `    "/m/${index}",`,
        "",
        `    () => ${index} as const,`,
        `  )`,
        "",
      );
    }

    lines.push("}", "");
  } else {
    lines.push('import { defineModule } from "../../../../../src"', "");

    if (scenario === "module-erased-named-mounted") {
      lines.push('import type { AnyRouteRef } from "../../../../../src"', "");
    }

    for (let index = start; index < end; index++) {
      lines.push(...moduleDefinition(scenario, index));
    }

    lines.push(`export const modules${chunkIndex} = [`);

    for (let index = start; index < end; index++) {
      lines.push(`  module${index},`);
    }

    lines.push("] as const", "");
  }

  writeFileSync(
    new URL(`chunk-${chunkIndex}.ts`, directory),

    `${lines.join("\n")}\n`,
  );
}

function moduleDefinition(
  scenario: Exclude<Scenario, "direct-route-control">,
  index: number,
): string[] {
  if (scenario === "module-unnamed-mounted") {
    return [
      `const module${index} = defineModule(`,
      `  "/m/${index}",`,
      "",
      "  (route) => {",
      "    route.get(",
      '      "/",',
      "",
      `      () => ${index} as const,`,
      "    )",
      "",
      "    return {}",
      "  },",
      ")",
      "",
    ];
  }

  if (scenario === "module-erased-named-mounted") {
    return [
      `const module${index} = defineModule(`,
      `  "/m/${index}",`,
      "",
      "  (route) => {",
      "    const read: AnyRouteRef =",
      "      route.get(",
      '        "/",',
      "",
      `        () => ${index} as const,`,
      "      )",
      "",
      "    return {",
      "      read,",
      "    }",
      "  },",
      ")",
      "",
    ];
  }

  return [
    `const module${index} = defineModule(`,
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
  ];
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
      lines.push(
        `import { modules${chunkIndex} } from "./chunk-${chunkIndex}"`,
      );
    }

    lines.push("", "const app = new Gelis()", "");

    if (scenario !== "module-named-unmounted") {
      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
        lines.push(
          `for (const module of modules${chunkIndex}) {`,
          "  app.mount(module)",
          "}",
          "",
        );
      }
    } else {
      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
        lines.push(`void modules${chunkIndex}`);
      }
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

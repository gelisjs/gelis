import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const SIZES = [100, 500, 1_000, 5_000] as const;

type BenchmarkSize = (typeof SIZES)[number];

const UNITS_PER_FILE = 50;

const SCENARIOS = ["direct-composition-control", "module-composition"] as const;

type Scenario = (typeof SCENARIOS)[number];

const GENERATED = new URL(
  "../generated/module-composition-scale/",
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

  if (scenario === "module-composition") {
    lines.push(
      'import { defineCapability, defineModule } from "../../../../../src"',
      "",
      'import type { Capability, Gelis } from "../../../../../src"',
      "",
      "interface DatabaseClient {",
      '  readonly kind: "database"',
      "}",
      "",
      `const Database: Capability<DatabaseClient> =`,
      `  defineCapability("module-scale-database-${chunkIndex}")`,
      "",
    );

    for (let index = start; index < end; index++) {
      lines.push(...moduleDefinition(index));
    }

    lines.push(`export function applyChunk${chunkIndex}(app: Gelis): void {`);

    for (let index = start; index < end; index++) {
      lines.push(`  app.mount(module${index})`);
    }

    lines.push("}", "");
  } else {
    lines.push(
      'import type { Gelis } from "../../../../../src"',
      "",
      "const database = {",
      '  kind: "database" as const,',
      "}",
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

function moduleDefinition(index: number): string[] {
  switch (index % 5) {
    case 0:
      return [
        `const module${index} = defineModule(`,
        `  "/module/${index}",`,
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

    case 1:
      return [
        `const module${index} = defineModule(`,
        `  "/module/${index}",`,
        "",
        "  (setup) => ({",
        "    database:",
        "      Database.require(",
        "        setup,",
        "      ),",
        "  }),",
        "",
        "  (route) => ({",
        "    read:",
        "      route.get(",
        '        "/",',
        "",
        "        (_context, scope) =>",
        "          scope.database.kind,",
        "      ),",
        "  }),",
        ")",
        "",
      ];

    case 2:
      return [
        `const module${index} = defineModule(`,
        `  "/module/${index}",`,
        "",
        "  (module) => {",
        "    const requestScope =",
        "      module.requestScope(",
        "        () => ({",
        `          value: ${index} as const,`,
        "        }),",
        "      )",
        "",
        "    return {",
        "      read:",
        "        requestScope.get(",
        '          "/",',
        "",
        "          (_context, requestScope) =>",
        "            requestScope.value,",
        "        ),",
        "    }",
        "  },",
        ")",
        "",
      ];

    case 3:
      return [
        `const module${index} = defineModule(`,
        `  "/module/${index}",`,
        "",
        "  (setup) => ({",
        "    database:",
        "      Database.require(",
        "        setup,",
        "      ),",
        "  }),",
        "",
        "  (module) => {",
        "    const requestScope =",
        "      module.requestScope(",
        "        (_context, moduleScope) => ({",
        "          kind:",
        "            moduleScope.database.kind,",
        "        }),",
        "      )",
        "",
        "    return {",
        "      read:",
        "        requestScope.get(",
        '          "/",',
        "",
        "          (",
        "            _context,",
        "            moduleScope,",
        "            requestScope,",
        "          ) => {",
        "            const kind:",
        '              "database" =',
        "              moduleScope.database.kind",
        "",
        "            void kind",
        "",
        "            return requestScope.kind",
        "          },",
        "        ),",
        "    }",
        "  },",
        ")",
        "",
      ];

    default:
      return [
        `const module${index} = defineModule(`,
        `  "/module/${index}",`,
        "",
        "  (setup) => ({",
        "    database:",
        "      Database.require(",
        "        setup,",
        "      ),",
        "  }),",
        "",
        "  {",
        "    beforeHandle(",
        "      _context,",
        "      moduleScope,",
        "    ) {",
        "      void moduleScope.database.kind",
        "    },",
        "",
        "    afterHandle(",
        "      _context,",
        "      _result,",
        "      moduleScope,",
        "    ) {",
        "      void moduleScope.database.kind",
        "    },",
        "  },",
        "",
        "  (module) => {",
        "    const requestScope =",
        "      module.requestScope(",
        "        (_context, moduleScope) => ({",
        "          kind:",
        "            moduleScope.database.kind,",
        "        }),",
        "      )",
        "",
        "    return {",
        "      read:",
        "        requestScope.get(",
        '          "/",',
        "",
        "          (",
        "            _context,",
        "            moduleScope,",
        "            requestScope,",
        "          ) => {",
        "            void moduleScope.database.kind",
        "",
        "            return requestScope.kind",
        "          },",
        "        ),",
        "    }",
        "  },",
        ")",
        "",
      ];
  }
}

function directComposition(index: number, indent: string): string[] {
  switch (index % 5) {
    case 0:
      return [
        `${indent}app.get(`,
        `${indent}  "/module/${index}",`,
        "",
        `${indent}  () => ${index} as const,`,
        `${indent})`,
        "",
      ];

    case 1:
      return [
        `${indent}const scope${index} =`,
        `${indent}  app.scope({`,
        `${indent}    database,`,
        `${indent}  })`,
        "",
        `${indent}scope${index}.get(`,
        `${indent}  "/module/${index}",`,
        "",
        `${indent}  (_context, scope) =>`,
        `${indent}    scope.database.kind,`,
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
        `${indent}  "/module/${index}",`,
        "",
        `${indent}  (_context, requestScope) =>`,
        `${indent}    requestScope.value,`,
        `${indent})`,
        "",
      ];

    case 3:
      return [
        `${indent}const requestScope${index} =`,
        `${indent}  app.requestScope(`,
        `${indent}    () => ({`,
        `${indent}      kind:`,
        `${indent}        database.kind,`,
        `${indent}    }),`,
        `${indent}  )`,
        "",
        `${indent}requestScope${index}.get(`,
        `${indent}  "/module/${index}",`,
        "",
        `${indent}  (_context, requestScope) => {`,
        `${indent}    const kind:`,
        `${indent}      "database" =`,
        `${indent}      database.kind`,
        "",
        `${indent}    void kind`,
        "",
        `${indent}    return requestScope.kind`,
        `${indent}  },`,
        `${indent})`,
        "",
      ];

    default:
      return [
        `${indent}const requestScope${index} =`,
        `${indent}  app.requestScope(`,
        `${indent}    () => ({`,
        `${indent}      kind:`,
        `${indent}        database.kind,`,
        `${indent}    }),`,
        `${indent}  )`,
        "",
        `${indent}requestScope${index}.get(`,
        `${indent}  "/module/${index}",`,
        "",
        `${indent}  (_context, requestScope) =>`,
        `${indent}    requestScope.kind,`,
        "",
        `${indent}  {`,
        `${indent}    beforeHandle() {`,
        `${indent}      void database.kind`,
        `${indent}    },`,
        "",
        `${indent}    afterHandle() {`,
        `${indent}      void database.kind`,
        `${indent}    },`,
        `${indent}  },`,
        `${indent})`,
        "",
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

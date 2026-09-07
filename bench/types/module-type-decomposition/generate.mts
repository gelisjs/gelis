import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const SIZES = [100, 5_000] as const;

type BenchmarkSize = (typeof SIZES)[number];

const UNITS_PER_FILE = 50;

const FEATURES = [
  "legacy",
  "dependency-scope",
  "static-request-scope",
  "scoped-request-scope",
  "scoped-request-lifecycle",
] as const;

type Feature = (typeof FEATURES)[number];

const SIDES = ["control", "module"] as const;

type Side = (typeof SIDES)[number];

const GENERATED = new URL(
  "../generated/module-type-decomposition/",
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
  for (const feature of FEATURES) {
    for (const side of SIDES) {
      generateCase(feature, side, size);
    }
  }
}

function generateCase(feature: Feature, side: Side, size: BenchmarkSize): void {
  const directory = caseDirectory(feature, side, size);

  const chunkCount = Math.ceil(size / UNITS_PER_FILE);

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    const start = chunkIndex * UNITS_PER_FILE;

    const end = Math.min(size, start + UNITS_PER_FILE);

    writeChunk(directory, feature, side, chunkIndex, start, end);
  }

  writeIndex(directory, chunkCount);
}

function caseDirectory(feature: Feature, side: Side, size: BenchmarkSize): URL {
  const directory = new URL(`./${feature}-${side}-${size}/`, GENERATED);

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
  feature: Feature,
  side: Side,
  chunkIndex: number,
  start: number,
  end: number,
): void {
  const lines: string[] = [];

  if (side === "module") {
    lines.push(
      'import { defineCapability, defineModule } from "../../../../../src"',
      "",
      'import type { Capability, Gelis } from "../../../../../src"',
      "",
      "interface DatabaseClient {",
      '  readonly kind: "database"',
      "}",
      "",
      "const Database: Capability<DatabaseClient> =",
      `  defineCapability("module-decomposition-${feature}-${chunkIndex}")`,
      "",
    );

    for (let index = start; index < end; index++) {
      lines.push(...moduleDefinition(feature, index));
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
      lines.push(...controlComposition(feature, index, "  "));
    }

    lines.push("}", "");
  }

  writeFileSync(
    new URL(`chunk-${chunkIndex}.ts`, directory),

    `${lines.join("\n")}\n`,
  );
}

function moduleDefinition(feature: Feature, index: number): string[] {
  switch (feature) {
    case "legacy":
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

    case "dependency-scope":
      return [
        `const module${index} = defineModule(`,
        `  "/m/${index}",`,
        "",
        "  (setup) => ({",
        "    database:",
        "      Database.require(setup),",
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

    case "static-request-scope":
      return [
        `const module${index} = defineModule(`,
        `  "/m/${index}",`,
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

    case "scoped-request-scope":
      return [
        `const module${index} = defineModule(`,
        `  "/m/${index}",`,
        "",
        "  (setup) => ({",
        "    database:",
        "      Database.require(setup),",
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

    case "scoped-request-lifecycle":
      return [
        `const module${index} = defineModule(`,
        `  "/m/${index}",`,
        "",
        "  (setup) => ({",
        "    database:",
        "      Database.require(setup),",
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

function controlComposition(
  feature: Feature,
  index: number,
  indent: string,
): string[] {
  switch (feature) {
    case "legacy":
      return [
        `${indent}app.get(`,
        `${indent}  "/m/${index}",`,
        "",
        `${indent}  () => ${index} as const,`,
        `${indent})`,
        "",
      ];

    case "dependency-scope":
      return [
        `${indent}const scope${index} =`,
        `${indent}  app.scope({`,
        `${indent}    database,`,
        `${indent}  })`,
        "",
        `${indent}scope${index}.get(`,
        `${indent}  "/m/${index}",`,
        "",
        `${indent}  (_context, scope) =>`,
        `${indent}    scope.database.kind,`,
        `${indent})`,
        "",
      ];

    case "static-request-scope":
      return [
        `${indent}const requestScope${index} =`,
        `${indent}  app.requestScope(`,
        `${indent}    () => ({`,
        `${indent}      value: ${index} as const,`,
        `${indent}    }),`,
        `${indent}  )`,
        "",
        `${indent}requestScope${index}.get(`,
        `${indent}  "/m/${index}",`,
        "",
        `${indent}  (_context, requestScope) =>`,
        `${indent}    requestScope.value,`,
        `${indent})`,
        "",
      ];

    case "scoped-request-scope":
      return [
        `${indent}const requestScope${index} =`,
        `${indent}  app.requestScope(`,
        `${indent}    () => ({`,
        `${indent}      kind: database.kind,`,
        `${indent}    }),`,
        `${indent}  )`,
        "",
        `${indent}requestScope${index}.get(`,
        `${indent}  "/m/${index}",`,
        "",
        `${indent}  (_context, requestScope) => {`,
        `${indent}    const kind: "database" =`,
        `${indent}      database.kind`,
        "",
        `${indent}    void kind`,
        "",
        `${indent}    return requestScope.kind`,
        `${indent}  },`,
        `${indent})`,
        "",
      ];

    case "scoped-request-lifecycle":
      return [
        `${indent}const requestScope${index} =`,
        `${indent}  app.requestScope(`,
        `${indent}    () => ({`,
        `${indent}      kind: database.kind,`,
        `${indent}    }),`,
        `${indent}  )`,
        "",
        `${indent}requestScope${index}.get(`,
        `${indent}  "/m/${index}",`,
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

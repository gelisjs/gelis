import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const SIZES = [100, 500, 1_000, 5_000] as const;

type BenchmarkSize = (typeof SIZES)[number];

const MODULES_PER_FILE = 50;

const SCENARIOS = [
  "explicit-factory-control",
  "requirement-map",
  "setup-token-require",
] as const;

type Scenario = (typeof SCENARIOS)[number];

const GENERATED = new URL(
  "../generated/module-dependency-model/",
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

  writeModel(directory, scenario, size);

  writeModuleFiles(directory, scenario, size);

  writeInstallFiles(directory, size);

  writeCorrectnessProbe(directory, scenario);

  writeIndex(directory, size);
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

function writeModel(
  directory: URL,
  scenario: Scenario,
  size: BenchmarkSize,
): void {
  const lines = modelPrelude(scenario);

  for (let index = 0; index < size; index++) {
    lines.push(
      `export type CapValue${index} = {`,
      `  readonly id: ${index}`,
      "  readonly value: string",
      "}",
      "",
      `export const cap${index} =`,
      `  null as unknown as Capability<CapValue${index}>`,
      "",
    );
  }

  lines.push("export const app = new App()", "");

  writeFileSync(
    new URL("model.ts", directory),

    `${lines.join("\n")}\n`,
  );
}

function commonPrelude(): string[] {
  return [
    "declare const capabilityValue: unique symbol",
    "",
    "export interface ModuleSetupContext {",
    "  read(token: unknown): unknown",
    "}",
    "",
    "export interface Capability<Value> {",
    "  readonly name: string",
    "  readonly [capabilityValue]?: Value",
    "  require(context: ModuleSetupContext): Value",
    "}",
    "",
    "export type CapabilityValue<Token> =",
    "  Token extends Capability<infer Value>",
    "    ? Value",
    "    : never",
    "",
    "export type AnyCapability = Capability<unknown>",
    "",
    "declare const moduleContract: unique symbol",
    "",
    "export interface ModuleRef<Contract> {",
    "  readonly name: string",
    "  readonly [moduleContract]?: Contract",
    "}",
    "",
    "export type ModuleContractOf<Module> =",
    "  Module extends ModuleRef<infer Contract>",
    "    ? Contract",
    "    : never",
    "",
    "export class App {",
    "  mount(module: ModuleRef<unknown>): this {",
    "    void module",
    "    return this",
    "  }",
    "}",
    "",
  ];
}

function modelPrelude(scenario: Scenario): string[] {
  if (scenario === "requirement-map") {
    return [
      ...commonPrelude(),
      "export type RequirementMap =",
      "  Readonly<Record<string, AnyCapability>>",
      "",
      "export type ResolvedRequirements<",
      "  Requirements extends RequirementMap,",
      "> = {",
      "  readonly [Name in keyof Requirements]:",
      "    CapabilityValue<Requirements[Name]>",
      "}",
      "",
      "export function defineModule<",
      "  const Requirements extends RequirementMap,",
      "  Contract,",
      ">(",
      "  name: string,",
      "  requirements: Requirements,",
      "  setup: (dependencies: ResolvedRequirements<Requirements>) => Contract,",
      "): ModuleRef<Contract> {",
      "  void requirements",
      "  void setup",
      "  return { name } as ModuleRef<Contract>",
      "}",
      "",
    ];
  }

  if (scenario === "setup-token-require") {
    return [
      ...commonPrelude(),
      "export function defineModule<Contract>(",
      "  name: string,",
      "  setup: (context: ModuleSetupContext) => Contract,",
      "): ModuleRef<Contract> {",
      "  void setup",
      "  return { name } as ModuleRef<Contract>",
      "}",
      "",
    ];
  }

  return [
    ...commonPrelude(),
    "export function defineModule<Contract>(",
    "  name: string,",
    "  setup: (...dependencies: any[]) => Contract,",
    "): ModuleRef<Contract> {",
    "  void setup",
    "  return { name } as ModuleRef<Contract>",
    "}",
    "",
  ];
}

function writeModuleFiles(
  directory: URL,
  scenario: Scenario,
  size: BenchmarkSize,
): void {
  for (const [fileIndex, chunk] of moduleChunks(size).entries()) {
    const lines = ['import * as m from "./model"', ""];

    for (
      let moduleIndex = chunk.start;
      moduleIndex < chunk.end;
      moduleIndex++
    ) {
      writeModule(lines, scenario, moduleIndex);
    }

    writeFileSync(
      new URL(moduleFileName(fileIndex), directory),

      `${lines.join("\n")}\n`,
    );
  }
}

function writeModule(
  lines: string[],
  scenario: Scenario,
  moduleIndex: number,
): void {
  const requirements = selectedRequirements(moduleIndex);

  if (scenario === "requirement-map") {
    lines.push(
      `export const module${moduleIndex} = m.defineModule(`,
      `  "module-${moduleIndex}",`,
      "  {",
    );

    for (const [index, required] of requirements.entries()) {
      lines.push(`    dep${index}: m.cap${required},`);
    }

    lines.push("  } as const,", "  (dependencies) => {");

    for (const index of requirements.keys()) {
      lines.push(
        `    const dep${index}Id: ${requirements[index]} = dependencies.dep${index}.id`,
        `    void dep${index}Id`,
        `    void dependencies.dep${index}.value`,
      );
    }

    lines.push(
      "",
      "    return {",
      `      id: ${moduleIndex} as const,`,
      `      path: "/module/${moduleIndex}" as const,`,
      "    }",
      "  },",
      ")",
      "",
    );

    return;
  }

  if (scenario === "setup-token-require") {
    lines.push(
      `export const module${moduleIndex} = m.defineModule(`,
      `  "module-${moduleIndex}",`,
      "  (setup) => {",
    );

    for (const [index, required] of requirements.entries()) {
      lines.push(
        `    const dep${index} = m.cap${required}.require(setup)`,
        `    const dep${index}Id: ${required} = dep${index}.id`,
        `    void dep${index}Id`,
        `    void dep${index}.value`,
      );
    }

    lines.push(
      "",
      "    return {",
      `      id: ${moduleIndex} as const,`,
      `      path: "/module/${moduleIndex}" as const,`,
      "    }",
      "  },",
      ")",
      "",
    );

    return;
  }

  const parameterTypes = requirements.map(
    (required, index) => `dep${index}: m.CapValue${required}`,
  );

  lines.push(
    `export const module${moduleIndex} = m.defineModule(`,
    `  "module-${moduleIndex}",`,
    `  (${parameterTypes.join(", ")}) => {`,
  );

  for (const [index, required] of requirements.entries()) {
    lines.push(
      `    const dep${index}Id: ${required} = dep${index}.id`,
      `    void dep${index}Id`,
      `    void dep${index}.value`,
    );
  }

  lines.push(
    "",
    "    return {",
    `      id: ${moduleIndex} as const,`,
    `      path: "/module/${moduleIndex}" as const,`,
    "    }",
    "  },",
    ")",
    "",
  );
}

function writeInstallFiles(directory: URL, size: BenchmarkSize): void {
  const chunks = moduleChunks(size);

  for (const [fileIndex, chunk] of chunks.entries()) {
    const previousImport =
      fileIndex === 0
        ? 'import { app as previousApp } from "./model"'
        : `import { installed as previousApp } from "./${installFileStem(
            fileIndex - 1,
          )}"`;

    const moduleNames: string[] = [];

    for (
      let moduleIndex = chunk.start;
      moduleIndex < chunk.end;
      moduleIndex++
    ) {
      moduleNames.push(`module${moduleIndex}`);
    }

    const lines = [
      previousImport,
      "",
      "import {",
      ...moduleNames.map((name) => `  ${name},`),
      `} from "./${moduleFileStem(fileIndex)}"`,
      "",
    ];

    let previous = "previousApp";

    for (
      let moduleIndex = chunk.start;
      moduleIndex < chunk.end;
      moduleIndex++
    ) {
      const current = `app${moduleIndex}`;

      lines.push(`const ${current} = ${previous}.mount(module${moduleIndex})`);

      previous = current;
    }

    lines.push("", `export const installed = ${previous}`, "");

    writeFileSync(
      new URL(installFileName(fileIndex), directory),

      `${lines.join("\n")}\n`,
    );
  }
}

function writeCorrectnessProbe(directory: URL, scenario: Scenario): void {
  let content: string;

  if (scenario === "requirement-map") {
    content = [
      'import { cap0, cap1, defineModule } from "./model"',
      "",
      'defineModule("probe", { source: cap0 } as const, (dependencies) => {',
      "  const id: 0 = dependencies.source.id",
      "  void id",
      "",
      "  // @ts-expect-error undeclared dependency alias.",
      "  void dependencies.missing",
      "",
      "  return { ok: true as const }",
      "})",
      "",
      'defineModule("probe-2", { source: cap1 } as const, (dependencies) => {',
      "  // @ts-expect-error cap1 carries literal id 1.",
      "  const id: 0 = dependencies.source.id",
      "  void id",
      "  return { ok: true as const }",
      "})",
      "",
    ].join("\n");
  } else if (scenario === "setup-token-require") {
    content = [
      'import { cap0, cap1, defineModule } from "./model"',
      "",
      'defineModule("probe", (setup) => {',
      "  const source = cap0.require(setup)",
      "  const id: 0 = source.id",
      "  void id",
      "",
      "  const second = cap1.require(setup)",
      "  // @ts-expect-error cap1 carries literal id 1.",
      "  const wrong: 0 = second.id",
      "  void wrong",
      "",
      "  return { ok: true as const }",
      "})",
      "",
    ].join("\n");
  } else {
    content = [
      'import { defineModule } from "./model"',
      'import type { CapValue0, CapValue1 } from "./model"',
      "",
      'defineModule("probe", (first: CapValue0, second: CapValue1) => {',
      "  const firstId: 0 = first.id",
      "  const secondId: 1 = second.id",
      "  void firstId",
      "  void secondId",
      "",
      "  // @ts-expect-error first dependency carries literal id 0.",
      "  const wrong: 1 = first.id",
      "  void wrong",
      "",
      "  return { ok: true as const }",
      "})",
      "",
    ].join("\n");
  }

  writeFileSync(
    new URL("correctness.ts", directory),

    `${content}\n`,
  );
}

function writeIndex(directory: URL, size: BenchmarkSize): void {
  const chunks = moduleChunks(size);

  const lastInstall = installFileStem(chunks.length - 1);

  const lastModule = size - 1;

  const lines = [
    `import { installed } from "./${lastInstall}"`,
    `import { module${lastModule} } from "./${moduleFileStem(
      chunks.length - 1,
    )}"`,
    "",
    'import type { App, ModuleContractOf } from "./model"',
    "",
    "type Equal<Left, Right> =",
    "  (<Type>() => Type extends Left ? 1 : 2) extends",
    "  (<Type>() => Type extends Right ? 1 : 2)",
    "    ? true",
    "    : false",
    "",
    "type Expect<Value extends true> = Value",
    "",
    "type StableRoot = Expect<Equal<typeof installed, App>>",
    "",
    `type LastContract = ModuleContractOf<typeof module${lastModule}>`,
    "",
    `type LastId = Expect<Equal<LastContract["id"], ${lastModule}>>`,
    "",
    `type LastPath = Expect<Equal<LastContract["path"], "/module/${lastModule}">>`,
    "",
    "export type { LastId, LastPath, StableRoot }",
    "",
  ];

  writeFileSync(
    new URL("index.ts", directory),

    `${lines.join("\n")}\n`,
  );
}

function selectedRequirements(moduleIndex: number): number[] {
  const requirements: number[] = [];

  for (let distance = 1; distance <= 4; distance++) {
    const required = moduleIndex - distance;

    if (required >= 0) {
      requirements.push(required);
    }
  }

  return requirements;
}

function moduleChunks(size: BenchmarkSize): Array<{
  readonly start: number;

  readonly end: number;
}> {
  const chunks: Array<{
    readonly start: number;

    readonly end: number;
  }> = [];

  for (let start = 0; start < size; start += MODULES_PER_FILE) {
    chunks.push({
      start,

      end: Math.min(size, start + MODULES_PER_FILE),
    });
  }

  return chunks;
}

function moduleFileStem(fileIndex: number): string {
  return `modules-${fileIndex}`;
}

function moduleFileName(fileIndex: number): string {
  return `${moduleFileStem(fileIndex)}.ts`;
}

function installFileStem(fileIndex: number): string {
  return `install-${fileIndex}`;
}

function installFileName(fileIndex: number): string {
  return `${installFileStem(fileIndex)}.ts`;
}

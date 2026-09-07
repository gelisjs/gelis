import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const SIZES = [100, 500, 1000, 5000] as const;

type BenchmarkSize = (typeof SIZES)[number];

const PLUGINS_PER_FILE = 50;

const GENERATED = new URL("../generated/plugin-setup-ops/", import.meta.url);

const SCENARIOS = [
  "baseline-untyped",
  "mapped-control",
  "setup-generic-ops",
  "token-bound-ops",
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

  writeModel(directory, scenario, size);
  writePluginFiles(directory, scenario, size);
  writeInstallFiles(directory, size);
  writeCorrectnessProbe(directory, scenario);
  writeIndex(directory, size);
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
    );

    if (scenario === "token-bound-ops") {
      lines.push(
        `export const cap${index} = {`,
        `  name: "cap${index}",`,
        "  require(context) {",
        "    return context.require(this)",
        "  },",
        "  provide(context, value) {",
        "    context.provide(this, value)",
        "  },",
        `} as BoundCapability<"cap${index}", CapValue${index}>`,
        "",
      );
    } else {
      lines.push(
        `export const cap${index} = {`,
        `  name: "cap${index}",`,
        `} as Capability<"cap${index}", CapValue${index}>`,
        "",
      );
    }
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
    "export interface Capability<",
    "  Name extends string = string,",
    "  Value = unknown,",
    "> {",
    "  readonly name: Name",
    "  readonly [capabilityValue]?: Value",
    "}",
    "",
    "export type AnyCapability = Capability<string, unknown>",
    "",
    "export type CapabilityValue<CapabilityType> =",
    "  CapabilityType extends Capability<string, infer Value>",
    "    ? Value",
    "    : never",
    "",
    "export interface Plugin {",
    "  readonly name: string",
    "  readonly setup: (context: PluginSetupContext) => void",
    "}",
    "",
    "export class App {",
    "  use(plugin: Plugin): this {",
    "    void plugin",
    "    return this",
    "  }",
    "}",
    "",
  ];
}

function modelPrelude(scenario: Scenario): string[] {
  if (scenario === "baseline-untyped") {
    return [
      ...commonPrelude(),
      "export interface PluginSetupContext {",
      "  require(capability: AnyCapability): any",
      "  provide(capability: AnyCapability, value: any): void",
      "}",
      "",
      "export function definePlugin(",
      "  name: string,",
      "  setup: (context: PluginSetupContext) => void,",
      "): Plugin {",
      "  return { name, setup }",
      "}",
      "",
    ];
  }

  if (scenario === "setup-generic-ops") {
    return [
      ...commonPrelude(),
      "export interface PluginSetupContext {",
      "  require<const Value>(",
      "    capability: Capability<string, Value>,",
      "  ): Value",
      "",
      "  provide<const Value>(",
      "    capability: Capability<string, Value>,",
      "    value: Value,",
      "  ): void",
      "}",
      "",
      "export function definePlugin(",
      "  name: string,",
      "  setup: (context: PluginSetupContext) => void,",
      "): Plugin {",
      "  return { name, setup }",
      "}",
      "",
    ];
  }

  if (scenario === "token-bound-ops") {
    return [
      ...commonPrelude(),
      "export interface PluginSetupContext {",
      "  require(capability: AnyCapability): unknown",
      "  provide(capability: AnyCapability, value: unknown): void",
      "}",
      "",
      "export interface BoundCapability<",
      "  Name extends string,",
      "  Value,",
      "> extends Capability<Name, Value> {",
      "  require(context: PluginSetupContext): Value",
      "  provide(context: PluginSetupContext, value: Value): void",
      "}",
      "",
      "export function definePlugin(",
      "  name: string,",
      "  setup: (context: PluginSetupContext) => void,",
      "): Plugin {",
      "  return { name, setup }",
      "}",
      "",
    ];
  }

  return [
    "declare const capabilityValue: unique symbol",
    "",
    "export interface Capability<",
    "  Name extends string = string,",
    "  Value = unknown,",
    "> {",
    "  readonly name: Name",
    "  readonly [capabilityValue]?: Value",
    "}",
    "",
    "export type AnyCapability = Capability<string, unknown>",
    "",
    "export type CapabilityValue<CapabilityType> =",
    "  CapabilityType extends Capability<string, infer Value>",
    "    ? Value",
    "    : never",
    "",
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
    "export interface PluginSetupContext {",
    "  require(capability: AnyCapability): unknown",
    "  provide(capability: AnyCapability, value: unknown): void",
    "}",
    "",
    "export interface Plugin {",
    "  readonly name: string",
    "  readonly setup: (context: PluginSetupContext) => void",
    "}",
    "",
    "export function definePlugin<",
    "  const Requirements extends RequirementMap,",
    "  const Provides extends AnyCapability,",
    ">(",
    "  name: string,",
    "  requirements: Requirements,",
    "  provides: Provides,",
    "  setup: (",
    "    dependencies: ResolvedRequirements<Requirements>,",
    "  ) => CapabilityValue<Provides>,",
    "): Plugin {",
    "  void requirements",
    "  void provides",
    "",
    "  return {",
    "    name,",
    "    setup: () => {",
    "      void setup",
    "    },",
    "  }",
    "}",
    "",
    "export class App {",
    "  use(plugin: Plugin): this {",
    "    void plugin",
    "    return this",
    "  }",
    "}",
    "",
  ];
}

function writePluginFiles(
  directory: URL,
  scenario: Scenario,
  size: BenchmarkSize,
): void {
  for (const [fileIndex, chunk] of pluginChunks(size).entries()) {
    const lines = ['import * as m from "./model"', ""];

    for (let plugin = chunk.start; plugin < chunk.end; plugin++) {
      writePlugin(lines, scenario, plugin);
    }

    writeFileSync(
      new URL(pluginFileName(fileIndex), directory),

      `${lines.join("\n")}\n`,
    );
  }
}

function writePlugin(
  lines: string[],
  scenario: Scenario,
  plugin: number,
): void {
  const requirements = selectedRequirements(plugin);

  if (scenario === "mapped-control") {
    lines.push(
      `export const plugin${plugin} = m.definePlugin(`,
      `  "plugin-${plugin}",`,
      "  {",
    );

    for (const [index, required] of requirements.entries()) {
      lines.push(`    dep${index}: m.cap${required},`);
    }

    lines.push("  } as const,", `  m.cap${plugin},`, "  (dependencies) => {");

    for (const index of requirements.keys()) {
      lines.push(`    void dependencies.dep${index}.value`);
    }

    lines.push(
      "",
      "    return {",
      `      id: ${plugin},`,
      `      value: "plugin-${plugin}",`,
      "    } as const",
      "  },",
      ")",
      "",
    );

    return;
  }

  lines.push(
    `export const plugin${plugin} = m.definePlugin(`,
    `  "plugin-${plugin}",`,
    "  (context) => {",
  );

  for (const [index, required] of requirements.entries()) {
    if (scenario === "token-bound-ops") {
      lines.push(
        `    const dep${index} = m.cap${required}.require(context)`,
        `    void dep${index}.value`,
      );
    } else {
      lines.push(
        `    const dep${index} = context.require(m.cap${required})`,
        `    void dep${index}.value`,
      );
    }
  }

  if (scenario === "token-bound-ops") {
    lines.push(
      "",
      `    m.cap${plugin}.provide(context, {`,
      `      id: ${plugin},`,
      `      value: "plugin-${plugin}",`,
      "    })",
    );
  } else {
    lines.push(
      "",
      `    context.provide(m.cap${plugin}, {`,
      `      id: ${plugin},`,
      `      value: "plugin-${plugin}",`,
      "    })",
    );
  }

  lines.push("  },", ")", "");
}

function writeInstallFiles(directory: URL, size: BenchmarkSize): void {
  const chunks = pluginChunks(size);

  for (const [fileIndex, chunk] of chunks.entries()) {
    const previousImport =
      fileIndex === 0
        ? 'import { app as previousApp } from "./model"'
        : `import { installed as previousApp } from "./${installFileStem(
            fileIndex - 1,
          )}"`;

    const pluginNames: string[] = [];

    for (let plugin = chunk.start; plugin < chunk.end; plugin++) {
      pluginNames.push(`plugin${plugin}`);
    }

    const lines = [
      previousImport,
      "",
      "import {",
      ...pluginNames.map((name) => `  ${name},`),
      `} from "./${pluginFileStem(fileIndex)}"`,
      "",
    ];

    let previous = "previousApp";

    for (let plugin = chunk.start; plugin < chunk.end; plugin++) {
      const current = `app${plugin}`;

      lines.push(`const ${current} = ${previous}.use(plugin${plugin})`);

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
  if (scenario === "baseline-untyped") {
    writeFileSync(
      new URL("correctness.ts", directory),

      [
        'import { cap0 } from "./model"',
        'import type { CapabilityValue } from "./model"',
        "",
        "type Value = CapabilityValue<typeof cap0>",
        "",
        "const value: Value = {",
        "  id: 0,",
        '  value: "ok",',
        "}",
        "",
        "void value",
        "",
      ].join("\n"),
    );

    return;
  }

  if (scenario === "mapped-control") {
    writeFileSync(
      new URL("correctness.ts", directory),

      [
        'import { cap0, cap1, definePlugin } from "./model"',
        "",
        "definePlugin(",
        '  "probe",',
        "  { source: cap0 } as const,",
        "  cap1,",
        "  (dependencies) => {",
        "    void dependencies.source.value",
        "",
        "    // @ts-expect-error undeclared dependency alias.",
        "    void dependencies.missing",
        "",
        "    return { id: 1, value: dependencies.source.value } as const",
        "  },",
        ")",
        "",
        "definePlugin(",
        '  "invalid-provider",',
        "  {} as const,",
        "  cap1,",
        "  // @ts-expect-error provider result must match cap1.",
        '  () => ({ id: 999, value: "invalid" } as const),',
        ")",
        "",
      ].join("\n"),
    );

    return;
  }

  if (scenario === "setup-generic-ops") {
    writeFileSync(
      new URL("correctness.ts", directory),

      [
        'import { cap0, cap1, definePlugin } from "./model"',
        "",
        'definePlugin("probe", (context) => {',
        "  const source = context.require(cap0)",
        "  const typedId: 0 = source.id",
        "  void typedId",
        "",
        "  context.provide(cap1, {",
        "    id: 1,",
        '    value: "ok",',
        "  })",
        "",
        "  context.provide(cap1, {",
        "    // @ts-expect-error cap1 requires literal id 1.",
        "    id: 999,",
        '    value: "invalid",',
        "  })",
        "})",
        "",
      ].join("\n"),
    );

    return;
  }

  writeFileSync(
    new URL("correctness.ts", directory),

    [
      'import { cap0, cap1, definePlugin } from "./model"',
      "",
      'definePlugin("probe", (context) => {',
      "  const source = cap0.require(context)",
      "  const typedId: 0 = source.id",
      "  void typedId",
      "",
      "  cap1.provide(context, {",
      "    id: 1,",
      '    value: "ok",',
      "  })",
      "",
      "  cap1.provide(context, {",
      "    // @ts-expect-error cap1 requires literal id 1.",
      "    id: 999,",
      '    value: "invalid",',
      "  })",
      "})",
      "",
    ].join("\n"),
  );
}

function writeIndex(directory: URL, size: BenchmarkSize): void {
  const finalFile = installFileStem(pluginChunks(size).length - 1);

  const lines = [
    `import { installed } from "./${finalFile}"`,
    'import { app } from "./model"',
    'import "./correctness"',
    "",
    "type Equal<Left, Right> =",
    "  (<Type>() => Type extends Left ? 1 : 2) extends",
    "  (<Type>() => Type extends Right ? 1 : 2)",
    "    ? (<Type>() => Type extends Right ? 1 : 2) extends",
    "      (<Type>() => Type extends Left ? 1 : 2)",
    "      ? true",
    "      : false",
    "    : false",
    "",
    "type RootStable = Equal<typeof app, typeof installed>",
    "",
    "const rootStable: RootStable = true",
    "void rootStable",
    "",
  ];

  writeFileSync(
    new URL("index.ts", directory),

    `${lines.join("\n")}\n`,
  );
}

function selectedRequirements(plugin: number): number[] {
  const offsets = [1, 2, 7, 13];

  const result: number[] = [];

  for (const offset of offsets) {
    const required = plugin - offset;

    if (required < 0 || result.includes(required)) {
      continue;
    }

    result.push(required);
  }

  return result;
}

function pluginChunks(size: BenchmarkSize): Array<{
  start: number;
  end: number;
}> {
  const chunks: Array<{
    start: number;
    end: number;
  }> = [];

  for (let start = 0; start < size; start += PLUGINS_PER_FILE) {
    chunks.push({
      start,
      end: Math.min(start + PLUGINS_PER_FILE, size),
    });
  }

  return chunks;
}

function pluginFileStem(index: number): string {
  return `plugins-${String(index).padStart(3, "0")}`;
}

function pluginFileName(index: number): string {
  return `${pluginFileStem(index)}.ts`;
}

function installFileStem(index: number): string {
  return `install-${String(index).padStart(3, "0")}`;
}

function installFileName(index: number): string {
  return `${installFileStem(index)}.ts`;
}

console.log(
  `Generated P8-B2.2 setup-operation type benchmarks for ${SIZES.join(", ")} plugins`,
);

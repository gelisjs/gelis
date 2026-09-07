import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const SIZES = [100, 500, 1000, 5000] as const;

type BenchmarkSize = (typeof SIZES)[number];

const PLUGINS_PER_FILE = 50;

const GENERATED = new URL("../generated/plugin-model/", import.meta.url);

const SCENARIOS = [
  "baseline-untyped",
  "root-generic",
  "token-tuple",
  "token-map",
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
  writeIndex(directory, scenario, size);
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
      `export const cap${index} = {`,
      `  name: "cap${index}",`,
      `} as Capability<"cap${index}", CapValue${index}>`,
      "",
    );
  }

  lines.push("export const app = new App()", "");

  writeFileSync(
    new URL("model.ts", directory),

    `${lines.join("\n")}\n`,
  );
}

function modelPrelude(scenario: Scenario): string[] {
  const common = [
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
  ];

  if (scenario === "baseline-untyped") {
    return [
      ...common,
      "export interface Plugin {",
      "  readonly name: string",
      "  readonly requires: readonly AnyCapability[]",
      "  readonly provides: AnyCapability",
      "}",
      "",
      "export function definePlugin(spec: {",
      "  readonly name: string",
      "  readonly requires: readonly AnyCapability[]",
      "  readonly provides: AnyCapability",
      "  readonly setup: (context: {",
      "    require(capability: AnyCapability): any",
      "  }) => unknown",
      "}): Plugin {",
      "  return spec as Plugin",
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

  if (scenario === "token-map") {
    return [
      ...common,
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
      "export interface Plugin<",
      "  Requirements extends RequirementMap,",
      "  Provides extends AnyCapability,",
      "> {",
      "  readonly name: string",
      "  readonly requires: Requirements",
      "  readonly provides: Provides",
      "}",
      "",
      "export type AnyPlugin = Plugin<",
      "  RequirementMap,",
      "  AnyCapability",
      ">",
      "",
      "export type PluginValueOf<PluginType> =",
      "  PluginType extends Plugin<RequirementMap, infer Provides>",
      "    ? CapabilityValue<Provides>",
      "    : never",
      "",
      "export function definePlugin<",
      "  const Requirements extends RequirementMap,",
      "  const Provides extends AnyCapability,",
      ">(spec: {",
      "  readonly name: string",
      "  readonly requires: Requirements",
      "  readonly provides: Provides",
      "  readonly setup: (",
      "    dependencies: ResolvedRequirements<Requirements>,",
      "  ) => CapabilityValue<Provides>",
      "}): Plugin<Requirements, Provides> {",
      "  return spec as Plugin<Requirements, Provides>",
      "}",
      "",
      "export class App {",
      "  use<",
      "    const Requirements extends RequirementMap,",
      "    const Provides extends AnyCapability,",
      "  >(plugin: Plugin<Requirements, Provides>): this {",
      "    void plugin",
      "    return this",
      "  }",
      "}",
      "",
    ];
  }

  const tupleModel = [
    ...common,
    "export type RequirementTuple = readonly AnyCapability[]",
    "",
    "export interface Plugin<",
    "  Requirements extends RequirementTuple,",
    "  Provides extends AnyCapability,",
    "> {",
    "  readonly name: string",
    "  readonly requires: Requirements",
    "  readonly provides: Provides",
    "}",
    "",
    "export type PluginValueOf<PluginType> =",
    "  PluginType extends Plugin<RequirementTuple, infer Provides>",
    "    ? CapabilityValue<Provides>",
    "    : never",
    "",
    "export interface PluginSetupContext<",
    "  Requirements extends RequirementTuple,",
    "> {",
    "  require<const Required extends Requirements[number]>(",
    "    capability: Required,",
    "  ): CapabilityValue<Required>",
    "}",
    "",
    "export function definePlugin<",
    "  const Requirements extends RequirementTuple,",
    "  const Provides extends AnyCapability,",
    ">(spec: {",
    "  readonly name: string",
    "  readonly requires: Requirements",
    "  readonly provides: Provides",
    "  readonly setup: (",
    "    context: PluginSetupContext<Requirements>,",
    "  ) => CapabilityValue<Provides>",
    "}): Plugin<Requirements, Provides> {",
    "  return spec as Plugin<Requirements, Provides>",
    "}",
    "",
  ];

  if (scenario === "token-tuple") {
    return [
      ...tupleModel,
      "export class App {",
      "  use<",
      "    const Requirements extends RequirementTuple,",
      "    const Provides extends AnyCapability,",
      "  >(plugin: Plugin<Requirements, Provides>): this {",
      "    void plugin",
      "    return this",
      "  }",
      "}",
      "",
    ];
  }

  return [
    ...tupleModel,
    "export class App<",
    "  Available extends AnyCapability = never,",
    "> {",
    "  use<",
    "    const Requirements extends RequirementTuple,",
    "    const Provides extends AnyCapability,",
    "  >(",
    "    plugin:",
    "      Exclude<Requirements[number], Available> extends never",
    "        ? Plugin<Requirements, Provides>",
    "        : never,",
    "  ): App<Available | Provides> {",
    "    void plugin",
    "",
    "    return this as unknown as App<Available | Provides>",
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
    const name = pluginFileName(fileIndex);

    const lines = ['import * as m from "./model"', ""];

    for (let plugin = chunk.start; plugin < chunk.end; plugin++) {
      writePlugin(lines, scenario, plugin);
    }

    writeFileSync(
      new URL(name, directory),

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

  if (scenario === "token-map") {
    lines.push(
      `export const plugin${plugin} = m.definePlugin({`,
      `  name: "plugin-${plugin}",`,
      "  requires: {",
    );

    for (const [index, required] of requirements.entries()) {
      lines.push(`    dep${index}: m.cap${required},`);
    }

    lines.push(
      "  } as const,",
      `  provides: m.cap${plugin},`,
      "  setup(dependencies) {",
    );

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
      "})",
      "",
    );

    return;
  }

  const requirementExpression =
    requirements.length === 0
      ? "[] as const"
      : `[${requirements
          .map((required) => `m.cap${required}`)
          .join(", ")}] as const`;

  lines.push(
    `export const plugin${plugin} = m.definePlugin({`,
    `  name: "plugin-${plugin}",`,
    `  requires: ${requirementExpression},`,
    `  provides: m.cap${plugin},`,
    "  setup(context) {",
  );

  for (const [index, required] of requirements.entries()) {
    lines.push(
      `    const dep${index} = context.require(m.cap${required})`,
      `    void dep${index}.value`,
    );
  }

  lines.push(
    "",
    "    return {",
    `      id: ${plugin},`,
    `      value: "plugin-${plugin}",`,
    "    } as const",
    "  },",
    "})",
    "",
  );
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
      `import {`,
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

  if (scenario === "token-map") {
    writeFileSync(
      new URL("correctness.ts", directory),

      [
        'import { cap0, cap1, definePlugin } from "./model"',
        'import type { PluginValueOf } from "./model"',
        "",
        "const probe = definePlugin({",
        '  name: "probe",',
        "  requires: {",
        "    source: cap0,",
        "  } as const,",
        "  provides: cap1,",
        "  setup(dependencies) {",
        "    void dependencies.source.value",
        "",
        "    // @ts-expect-error undeclared dependency alias.",
        "    void dependencies.missing",
        "",
        "    return {",
        "      id: 1,",
        '      value: "probe",',
        "    } as const",
        "  },",
        "})",
        "",
        "type ProbeValue = PluginValueOf<typeof probe>",
        "",
        "const valid: ProbeValue = {",
        "  id: 1,",
        '  value: "valid",',
        "}",
        "",
        "// @ts-expect-error provider value preserves the literal id.",
        'const invalid: ProbeValue = { id: 999, value: "invalid" }',
        "",
        "void valid",
        "void invalid",
        "",
      ].join("\n"),
    );

    return;
  }

  const lines = [
    'import { App, cap0, cap1, definePlugin } from "./model"',
    'import type { PluginValueOf } from "./model"',
    "",
    "const probe = definePlugin({",
    '  name: "probe",',
    "  requires: [cap0] as const,",
    "  provides: cap1,",
    "  setup(context) {",
    "    const source = context.require(cap0)",
    "",
    "    // @ts-expect-error cap1 is not declared as a requirement.",
    "    context.require(cap1)",
    "",
    "    return {",
    "      id: 1,",
    "      value: source.value,",
    "    } as const",
    "  },",
    "})",
    "",
    "type ProbeValue = PluginValueOf<typeof probe>",
    "",
    "const valid: ProbeValue = {",
    "  id: 1,",
    '  value: "valid",',
    "}",
    "",
    "// @ts-expect-error provider value preserves the literal id.",
    'const invalid: ProbeValue = { id: 999, value: "invalid" }',
    "",
  ];

  if (scenario === "root-generic") {
    lines.push(
      "const empty = new App()",
      "",
      "// @ts-expect-error compile-time registry rejects unavailable requirements.",
      "empty.use(probe)",
      "",
    );
  }

  lines.push("void valid", "void invalid", "");

  writeFileSync(
    new URL("correctness.ts", directory),

    lines.join("\n"),
  );
}

function writeIndex(
  directory: URL,
  scenario: Scenario,
  size: BenchmarkSize,
): void {
  const finalFile = installFileStem(pluginChunks(size).length - 1);

  const lines = [
    `import { installed } from "./${finalFile}"`,
    'import { app } from "./model"',
    'import "./correctness"',
    "",
  ];

  if (scenario !== "root-generic") {
    lines.push(
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
    );
  } else {
    lines.push(
      "// Root-generic is intentionally a comparison model.",
      "// Its installed application type accumulates provided capabilities.",
      "void app",
      "void installed",
      "",
    );
  }

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
  `Generated P8-B2 plugin type-model benchmarks for ${SIZES.join(", ")} plugins`,
);

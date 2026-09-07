import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const SIZES = [100, 500, 1000, 5000] as const;
type BenchmarkSize = (typeof SIZES)[number];

const PLUGINS_PER_FILE = 50;
const GENERATED = new URL("../generated/plugin-token-local/", import.meta.url);

const SCENARIOS = [
  "generic-control",
  "method-token-untyped",
  "method-token-typed",
  "callable-token-untyped",
  "callable-token-typed",
] as const;

type Scenario = (typeof SCENARIOS)[number];

rmSync(GENERATED, { recursive: true, force: true });
mkdirSync(GENERATED, { recursive: true });

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

  mkdirSync(directory, { recursive: true });

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
    );

    if (
      scenario === "callable-token-untyped" ||
      scenario === "callable-token-typed"
    ) {
      lines.push(
        `export const cap${index} = null as unknown as CallableCapability<`,
        `  "cap${index}",`,
        `  CapValue${index}`,
        ">",
        "",
      );
    } else {
      lines.push(
        `export const cap${index} = null as unknown as MethodCapability<`,
        `  "cap${index}",`,
        `  CapValue${index}`,
        ">",
        "",
      );
    }
  }

  lines.push("export const app = new App()", "");

  writeFileSync(new URL("model.ts", directory), `${lines.join("\n")}\n`);
}

function commonPrelude(): string[] {
  return [
    "export interface PluginSetupContext {",
    "  read(token: unknown): unknown",
    "  write(token: unknown, value: unknown): void",
    "}",
    "",
    "export interface Plugin {",
    "  readonly name: string",
    "  readonly setup: (context: PluginSetupContext) => void",
    "}",
    "",
    "export function definePlugin(",
    "  name: string,",
    "  setup: (context: PluginSetupContext) => void,",
    "): Plugin {",
    "  return { name, setup }",
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
  if (scenario === "generic-control") {
    return [
      "declare const capabilityValue: unique symbol",
      "",
      "export interface MethodCapability<",
      "  Name extends string,",
      "  Value,",
      "> {",
      "  readonly name: Name",
      "  readonly [capabilityValue]?: Value",
      "}",
      "",
      ...commonPrelude(),
      "export interface GenericSetupContext extends PluginSetupContext {",
      "  require<const Value>(",
      "    capability: MethodCapability<string, Value>,",
      "  ): Value",
      "",
      "  provide<const Value>(",
      "    capability: MethodCapability<string, Value>,",
      "    value: Value,",
      "  ): void",
      "}",
      "",
      "export function defineGenericPlugin(",
      "  name: string,",
      "  setup: (context: GenericSetupContext) => void,",
      "): Plugin {",
      "  return {",
      "    name,",
      "    setup: setup as unknown as (context: PluginSetupContext) => void,",
      "  }",
      "}",
      "",
    ];
  }

  if (scenario === "method-token-untyped") {
    return [
      "declare const capabilityValue: unique symbol",
      "",
      "export interface MethodCapability<",
      "  Name extends string,",
      "  Value,",
      "> {",
      "  readonly name: Name",
      "  readonly [capabilityValue]?: Value",
      "  require(context: PluginSetupContext): any",
      "  provide(context: PluginSetupContext, value: any): void",
      "}",
      "",
      ...commonPrelude(),
    ];
  }

  if (scenario === "method-token-typed") {
    return [
      "declare const capabilityValue: unique symbol",
      "",
      "export interface MethodCapability<",
      "  Name extends string,",
      "  Value,",
      "> {",
      "  readonly name: Name",
      "  readonly [capabilityValue]?: Value",
      "  require(context: PluginSetupContext): Value",
      "  provide(context: PluginSetupContext, value: Value): void",
      "}",
      "",
      ...commonPrelude(),
    ];
  }

  if (scenario === "callable-token-untyped") {
    return [
      "declare const capabilityValue: unique symbol",
      "",
      "export interface CallableCapability<",
      "  Name extends string,",
      "  Value,",
      "> {",
      "  (context: PluginSetupContext): any",
      "  readonly name: Name",
      "  readonly [capabilityValue]?: Value",
      "  provide(context: PluginSetupContext, value: any): void",
      "}",
      "",
      ...commonPrelude(),
    ];
  }

  return [
    "declare const capabilityValue: unique symbol",
    "",
    "export interface CallableCapability<",
    "  Name extends string,",
    "  Value,",
    "> {",
    "  (context: PluginSetupContext): Value",
    "  readonly name: Name",
    "  readonly [capabilityValue]?: Value",
    "  provide(context: PluginSetupContext, value: Value): void",
    "}",
    "",
    ...commonPrelude(),
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
  const define =
    scenario === "generic-control" ? "defineGenericPlugin" : "definePlugin";

  lines.push(
    `export const plugin${plugin} = m.${define}(`,
    `  "plugin-${plugin}",`,
    "  (context) => {",
  );

  for (const [index, required] of requirements.entries()) {
    if (scenario === "generic-control") {
      lines.push(`    const dep${index} = context.require(m.cap${required})`);
    } else if (
      scenario === "callable-token-untyped" ||
      scenario === "callable-token-typed"
    ) {
      lines.push(`    const dep${index} = m.cap${required}(context)`);
    } else {
      lines.push(`    const dep${index} = m.cap${required}.require(context)`);
    }

    lines.push(`    void dep${index}.value`);
  }

  if (scenario === "generic-control") {
    lines.push(
      "",
      `    context.provide(m.cap${plugin}, {`,
      `      id: ${plugin},`,
      `      value: "plugin-${plugin}",`,
      "    })",
    );
  } else {
    lines.push(
      "",
      `    m.cap${plugin}.provide(context, {`,
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
  if (
    scenario === "method-token-untyped" ||
    scenario === "callable-token-untyped"
  ) {
    writeFileSync(
      new URL("correctness.ts", directory),
      ['import { cap0 } from "./model"', "", "void cap0", ""].join("\n"),
    );

    return;
  }

  if (scenario === "generic-control") {
    writeFileSync(
      new URL("correctness.ts", directory),
      [
        'import { cap0, cap1, defineGenericPlugin } from "./model"',
        "",
        'defineGenericPlugin("probe", (context) => {',
        "  const source = context.require(cap0)",
        "  const typedId: 0 = source.id",
        "  void typedId",
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

  const readExpression =
    scenario === "callable-token-typed"
      ? "cap0(context)"
      : "cap0.require(context)";

  writeFileSync(
    new URL("correctness.ts", directory),
    [
      'import { cap0, cap1, definePlugin } from "./model"',
      "",
      'definePlugin("probe", (context) => {',
      `  const source = ${readExpression}`,
      "  const typedId: 0 = source.id",
      "  void typedId",
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

  writeFileSync(
    new URL("index.ts", directory),
    [
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
    ].join("\n"),
  );
}

function selectedRequirements(plugin: number): number[] {
  const offsets = [1, 2, 7, 13];
  const result: number[] = [];

  for (const offset of offsets) {
    const required = plugin - offset;

    if (required >= 0 && !result.includes(required)) {
      result.push(required);
    }
  }

  return result;
}

function pluginChunks(size: BenchmarkSize): Array<{
  start: number;
  end: number;
}> {
  const chunks: Array<{ start: number; end: number }> = [];

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
  `Generated P8-B2.4 token-local type benchmarks for ${SIZES.join(", ")} plugins`,
);

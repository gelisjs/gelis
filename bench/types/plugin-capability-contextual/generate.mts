import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const SIZES = [100, 500, 1000, 5000] as const;
type BenchmarkSize = (typeof SIZES)[number];

const PLUGINS_PER_FILE = 50;

const GENERATED = new URL(
  "../generated/plugin-capability-contextual/",
  import.meta.url,
);

const SCENARIOS = [
  "typed-cast-control",
  "contextual-factory-typed",
  "generic-factory-control",
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

  writeModel(directory, scenario, size);
  writePluginFiles(directory, size);
  writeInstallFiles(directory, size);
  writeCorrectnessProbe(directory, scenario);
  writeIndex(directory, size);
}

function writeModel(
  directory: URL,
  scenario: Scenario,
  size: BenchmarkSize,
): void {
  const lines = [
    "export interface PluginSetupContext {",
    "  read(token: object): unknown",
    "  write(token: object, value: unknown): void",
    "}",
    "",
    "export interface Capability<Value> {",
    "  readonly name: string",
    "",
    "  require(context: PluginSetupContext): Value",
    "",
    "  provide(",
    "    context: PluginSetupContext,",
    "    value: Value,",
    "  ): void",
    "}",
    "",
  ];

  if (scenario === "contextual-factory-typed") {
    lines.push(
      "export function defineCapability(",
      "  name: string,",
      "): Capability<never> {",
      "  const capability: Capability<never> = {",
      "    name,",
      "",
      "    require(context) {",
      "      return context.read(capability) as never",
      "    },",
      "",
      "    provide(context, value) {",
      "      context.write(capability, value)",
      "    },",
      "  }",
      "",
      "  return capability",
      "}",
      "",
    );
  } else if (scenario === "generic-factory-control") {
    lines.push(
      "export function defineCapability<Value>(",
      "  name: string,",
      "): Capability<Value> {",
      "  const capability: Capability<Value> = {",
      "    name,",
      "",
      "    require(context) {",
      "      return context.read(capability) as Value",
      "    },",
      "",
      "    provide(context, value) {",
      "      context.write(capability, value)",
      "    },",
      "  }",
      "",
      "  return capability",
      "}",
      "",
    );
  }

  lines.push(
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
  );

  for (let index = 0; index < size; index++) {
    lines.push(
      `export type CapValue${index} = {`,
      `  readonly id: ${index}`,
      "  readonly value: string",
      "}",
      "",
    );

    if (scenario === "contextual-factory-typed") {
      lines.push(
        `export const cap${index}: Capability<CapValue${index}> =`,
        `  defineCapability("cap${index}")`,
        "",
      );
    } else if (scenario === "generic-factory-control") {
      lines.push(
        `export const cap${index} = defineCapability<CapValue${index}>(`,
        `  "cap${index}",`,
        ")",
        "",
      );
    } else {
      lines.push(
        `export const cap${index} =`,
        `  null as unknown as Capability<CapValue${index}>`,
        "",
      );
    }
  }

  lines.push("export const app = new App()", "");

  writeFileSync(new URL("model.ts", directory), `${lines.join("\n")}\n`);
}

function writePluginFiles(directory: URL, size: BenchmarkSize): void {
  for (const [fileIndex, chunk] of pluginChunks(size).entries()) {
    const lines = ['import * as m from "./model"', ""];

    for (let plugin = chunk.start; plugin < chunk.end; plugin++) {
      const requirements = selectedRequirements(plugin);

      lines.push(
        `export const plugin${plugin} = m.definePlugin(`,
        `  "plugin-${plugin}",`,
        "  (context) => {",
      );

      for (const [index, required] of requirements.entries()) {
        lines.push(
          `    const dep${index} = m.cap${required}.require(context)`,
          `    void dep${index}.value`,
        );
      }

      lines.push(
        "",
        `    m.cap${plugin}.provide(context, {`,
        `      id: ${plugin},`,
        `      value: "plugin-${plugin}",`,
        "    })",
        "  },",
        ")",
        "",
      );
    }

    writeFileSync(
      new URL(pluginFileName(fileIndex), directory),
      `${lines.join("\n")}\n`,
    );
  }
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
  const lines = [
    'import { cap0, cap1, definePlugin } from "./model"',
    "",
    'definePlugin("probe", (context) => {',
    "  const source = cap0.require(context)",
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
  ];

  if (scenario === "contextual-factory-typed") {
    lines.push(
      'import { defineCapability } from "./model"',
      "",
      'const untyped = defineCapability("untyped")',
      "",
      "declare const setupContext:",
      '  import("./model").PluginSetupContext',
      "",
      "// @ts-expect-error unannotated capability is fail-closed.",
      "untyped.provide(setupContext, { value: 1 })",
      "",
      "const unresolved = untyped.require(setupContext)",
      "",
      "// @ts-expect-error unresolved capability value is never.",
      "void unresolved.value",
      "",
    );
  }

  writeFileSync(new URL("correctness.ts", directory), lines.join("\n"));
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
  `Generated P8-B3-A3 contextual capability benchmarks for ${SIZES.join(
    ", ",
  )} capabilities/plugins`,
);

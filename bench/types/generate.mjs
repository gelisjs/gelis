import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const SIZES = [100, 500, 1000, 5000];

const ROUTES_PER_FILE = 50;

const GENERATED = new URL("./generated/", import.meta.url);

rmSync(GENERATED, {
  recursive: true,
  force: true,
});

mkdirSync(GENERATED, {
  recursive: true,
});

for (const size of SIZES) {
  generateBaseline(size);
  generateRoutes(size);
  generateContract(size);
  generateRichContract(size);

  generateClient(size, "client-sparse", "sparse");

  generateClient(size, "client-module", "module");

  generateClient(size, "client", "all");
}

function caseDir(name, size) {
  const directory = new URL(`./generated/${name}-${size}/`, import.meta.url);

  mkdirSync(directory, {
    recursive: true,
  });

  writeTsconfig(directory);

  return directory;
}

function writeTsconfig(directory) {
  const config = {
    extends: "../../../../tsconfig.json",

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

function chunks(size) {
  const result = [];

  for (let start = 0; start < size; start += ROUTES_PER_FILE) {
    result.push({
      start,

      end: Math.min(start + ROUTES_PER_FILE, size),
    });
  }

  return result;
}

function generateBaseline(size) {
  const directory = caseDir("baseline", size);

  const imports = [];

  for (const [fileIndex, { start, end }] of chunks(size).entries()) {
    const name = `routes-${String(fileIndex).padStart(3, "0")}.ts`;

    imports.push(`import './${name}'`);

    const lines = ["type Params = { id: string }", ""];

    for (let i = start; i < end; i++) {
      lines.push(
        `const route${i} = ` +
          `(params: Params) => ` +
          `({ id: params.id, route: ${i} })`,
      );

      lines.push(`type Probe${i} = ` + `ReturnType<typeof route${i}>`);

      lines.push("");
    }

    writeFileSync(
      new URL(name, directory),

      `${lines.join("\n")}\n`,
    );
  }

  writeFileSync(
    new URL("index.ts", directory),

    `${imports.join("\n")}\n`,
  );
}

function generateRoutes(size) {
  const directory = caseDir("routes", size);

  const imports = [];

  writeFileSync(
    new URL("app.ts", directory),

    [
      "import { Gelis } from '../../../../src'",
      "",
      "export const app = new Gelis()",
      "",
    ].join("\n"),
  );

  for (const [fileIndex, { start, end }] of chunks(size).entries()) {
    const name = `routes-${String(fileIndex).padStart(3, "0")}.ts`;

    imports.push(`import './${name}'`);

    const lines = ["import { app } from './app'", ""];

    for (let i = start; i < end; i++) {
      lines.push(
        `app.get(` +
          `'/bench/${i}/:id', ` +
          `({ params }) => ` +
          `({ id: params.id, route: ${i} })` +
          `)`,
      );
    }

    writeFileSync(
      new URL(name, directory),

      `${lines.join("\n")}\n`,
    );
  }

  writeFileSync(
    new URL("index.ts", directory),

    [
      imports.join("\n"),

      "import { app } from './app'",

      "",

      "type AppAfterRoutes = typeof app",

      "void (null as unknown as AppAfterRoutes)",

      "",
    ].join("\n"),
  );
}

function generateContract(size) {
  const directory = caseDir("contract", size);

  const modules = [];
  const routeLocations = [];

  for (const [moduleIndex, { start, end }] of chunks(size).entries()) {
    const moduleName = `module${moduleIndex}`;

    const fileName = `module-${String(moduleIndex).padStart(3, "0")}.ts`;

    modules.push({
      moduleName,
      fileName,
    });

    const lines = [
      "import { defineModule } from '../../../../src'",

      "",

      `export const ${moduleName} = ` +
        `defineModule('/m${moduleIndex}', ` +
        `(route) => ({`,
    ];

    for (let i = start; i < end; i++) {
      const local = i - start;

      const routeName = `r${local}`;

      lines.push(
        `  ${routeName}: ` +
          `route.get(` +
          `'/r${local}/:id', ` +
          `({ params }) => ` +
          `({ id: params.id, route: ${i} })` +
          `),`,
      );

      routeLocations.push({
        moduleName,
        routeName,
      });
    }

    lines.push("}))");

    writeFileSync(
      new URL(fileName, directory),

      `${lines.join("\n")}\n`,
    );
  }

  const index = [
    "import { defineContract } from '../../../../src'",

    "import type { ApiContractOf } from '../../../../src'",
  ];

  for (const { moduleName, fileName } of modules) {
    index.push(
      `import { ${moduleName} } ` + `from './${fileName.replace(/\.ts$/, "")}'`,
    );
  }

  index.push("", "const api = defineContract({");

  for (const { moduleName } of modules) {
    index.push(`  ${moduleName},`);
  }

  index.push("})", "", "type Api = ApiContractOf<typeof api>", "");

  for (const { moduleName, routeName } of routeLocations) {
    const probe = `Probe_${moduleName}_${routeName}`;

    index.push(
      `type ${probe} = [`,
      `  Api['${moduleName}']['${routeName}']['path'],`,
      `  Api['${moduleName}']['${routeName}']['request']['params'],`,
      `  Api['${moduleName}']['${routeName}']['responses'],`,
      `]`,
      `void (null as unknown as ${probe})`,
      "",
    );
  }

  writeFileSync(
    new URL("index.ts", directory),

    `${index.join("\n")}\n`,
  );
}

function generateRichContract(size) {
  const directory = caseDir("rich-contract", size);

  writeFileSync(
    new URL("schemas.ts", directory),

    [
      "import type { StandardSchemaV1 } from '../../../../src'",
      "",
      "export declare const QuerySchema:",
      "  StandardSchemaV1<",
      "    {",
      "      page: string",
      "      mode?: 'ok' | 'conflict'",
      "    },",
      "    {",
      "      page: number",
      "      mode: 'ok' | 'conflict'",
      "    }",
      "  >",
      "",
      "export declare const BodySchema:",
      "  StandardSchemaV1<",
      "    {",
      "      name: string",
      "    },",
      "    {",
      "      name: string",
      "      normalized: true",
      "    }",
      "  >",
      "",
      "export declare const SuccessSchema:",
      "  StandardSchemaV1<{",
      "    id: string",
      "    name: string",
      "    page: number",
      "  }>",
      "",
      "export declare const ConflictSchema:",
      "  StandardSchemaV1<{",
      "    code: 'CONFLICT'",
      "  }>",
      "",
      "export declare const InvalidSchema:",
      "  StandardSchemaV1<{",
      "    code: 'INVALID'",
      "  }>",
      "",
    ].join("\n"),
  );

  const modules = [];
  const routeLocations = [];

  for (const [moduleIndex, { start, end }] of chunks(size).entries()) {
    const moduleName = `module${moduleIndex}`;

    const fileName = `module-${String(moduleIndex).padStart(3, "0")}.ts`;

    modules.push({
      moduleName,
      fileName,
    });

    const lines = [
      "import { defineModule } from '../../../../src'",

      "import {",
      "  QuerySchema,",
      "  BodySchema,",
      "  SuccessSchema,",
      "  ConflictSchema,",
      "  InvalidSchema,",
      "} from './schemas'",

      "",

      `export const ${moduleName} = ` +
        `defineModule('/m${moduleIndex}', ` +
        `(route) => ({`,
    ];

    for (let i = start; i < end; i++) {
      const local = i - start;

      const routeName = `r${local}`;

      lines.push(
        `  ${routeName}: route.post(`,
        `    '/r${local}/:id',`,
        "    {",
        "      query: QuerySchema,",
        "      body: BodySchema,",
        "      responses: {",
        "        200: SuccessSchema,",
        "        409: ConflictSchema,",
        "        422: InvalidSchema,",
        "      },",
        "    },",
        "    ({ params, query, body, reply }) => {",
        "      if (query.mode === 'conflict') {",
        "        return reply.status(409, {",
        "          code: 'CONFLICT',",
        "        })",
        "      }",
        "",
        "      if (query.page < 0) {",
        "        return reply.status(422, {",
        "          code: 'INVALID',",
        "        })",
        "      }",
        "",
        "      return reply.status(200, {",
        "        id: params.id,",
        "        name: body.name,",
        "        page: query.page,",
        "      })",
        "    },",
        "  ),",
      );

      routeLocations.push({
        moduleName,
        routeName,
      });
    }

    lines.push("}))");

    writeFileSync(
      new URL(fileName, directory),

      `${lines.join("\n")}\n`,
    );
  }

  const index = [
    "import { defineContract } from '../../../../src'",

    "import type { ApiContractOf } from '../../../../src'",
  ];

  for (const { moduleName, fileName } of modules) {
    index.push(
      `import { ${moduleName} } ` + `from './${fileName.replace(/\.ts$/, "")}'`,
    );
  }

  index.push("", "const api = defineContract({");

  for (const { moduleName } of modules) {
    index.push(`  ${moduleName},`);
  }

  index.push("})", "", "type Api = ApiContractOf<typeof api>", "");

  for (const { moduleName, routeName } of routeLocations) {
    const probe = `Probe_${moduleName}_${routeName}`;

    index.push(
      `type ${probe} = [`,
      `  Api['${moduleName}']['${routeName}']['path'],`,
      `  Api['${moduleName}']['${routeName}']['request']['params'],`,
      `  Api['${moduleName}']['${routeName}']['request']['query'],`,
      `  Api['${moduleName}']['${routeName}']['request']['body'],`,
      `  Api['${moduleName}']['${routeName}']['responses'],`,
      `]`,
      `void (null as unknown as ${probe})`,
      "",
    );
  }

  writeFileSync(
    new URL("index.ts", directory),

    `${index.join("\n")}\n`,
  );
}

function generateClient(size, scenario, probeMode) {
  const directory = caseDir(scenario, size);

  const modules = [];
  const routeLocations = [];

  for (const [moduleIndex, { start, end }] of chunks(size).entries()) {
    const moduleName = `module${moduleIndex}`;

    const fileName = `module-${String(moduleIndex).padStart(3, "0")}`;

    modules.push({
      moduleName,
      fileName,
    });

    for (let i = start; i < end; i++) {
      routeLocations.push({
        moduleName,
        routeName: `r${i - start}`,
      });
    }
  }

  const index = [
    "import { defineContract } from '../../../../src'",

    "import type { GelisClient } from '../../../../prototype/client'",
  ];

  for (const { moduleName, fileName } of modules) {
    index.push(
      `import { ${moduleName} } ` +
        `from '../rich-contract-${size}/${fileName}'`,
    );
  }

  index.push("", "const api = defineContract({");

  for (const { moduleName } of modules) {
    index.push(`  ${moduleName},`);
  }

  index.push("})", "", "type Client = GelisClient<typeof api>", "");

  const probeLocations = selectClientProbes(routeLocations, probeMode);

  for (const { moduleName, routeName } of probeLocations) {
    const suffix = `${moduleName}_${routeName}`;

    const method = `Method_${suffix}`;

    const request = `Request_${suffix}`;

    const result = `Result_${suffix}`;

    const success = `Success_${suffix}`;

    const conflict = `Conflict_${suffix}`;

    const invalid = `Invalid_${suffix}`;

    const probe = `Probe_${suffix}`;

    index.push(
      `type ${method} = ` + `Client['${moduleName}']['${routeName}']`,

      `type ${request} = ` + `Parameters<${method}>[0]`,

      `type ${result} = ` + `Awaited<ReturnType<${method}>>`,

      `type ${success} = ` + `Extract<${result}, { status: 200 }>`,

      `type ${conflict} = ` + `Extract<${result}, { status: 409 }>`,

      `type ${invalid} = ` + `Extract<${result}, { status: 422 }>`,

      `type ${probe} = [`,

      `  ${request}['params'],`,
      `  ${request}['query'],`,
      `  ${request}['body'],`,

      `  ${result}['status'],`,

      `  ${success}['data'],`,
      `  ${conflict}['data'],`,
      `  ${invalid}['data'],`,

      `  ${result}['headers'],`,
      `  ${result}['response'],`,

      `]`,

      `void (null as unknown as ${probe})`,

      "",
    );
  }

  writeFileSync(
    new URL("index.ts", directory),

    `${index.join("\n")}\n`,
  );
}

function selectClientProbes(routes, mode) {
  if (mode === "all") {
    return routes;
  }

  if (mode === "module") {
    return routes.slice(0, ROUTES_PER_FILE);
  }

  if (mode === "sparse") {
    const count = Math.min(10, routes.length);

    if (count === routes.length) {
      return routes;
    }

    const lastIndex = routes.length - 1;

    return Array.from(
      {
        length: count,
      },

      (_, index) => {
        const position = Math.round((index * lastIndex) / (count - 1));

        return routes[position];
      },
    );
  }

  throw new Error(`Unknown client probe mode: ${mode}`);
}

console.log(`Generated type benchmarks for: ` + `${SIZES.join(", ")} routes`);

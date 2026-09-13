import { spawnSync } from "node:child_process";

const affinityMaskHex = "400";

function quoteCmd(value: string): string {
  if (!/[\s"&|<>^]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function runDirect() {
  return spawnSync(process.execPath, ["--version"], {
    encoding: "utf8",
    windowsHide: true,
  });
}

function runStart(flags: readonly string[]) {
  const command = [
    "start",
    '""',
    "/b",
    "/wait",
    ...flags,
    quoteCmd(process.execPath),
    "--version",
  ].join(" ");

  return spawnSync("cmd.exe", ["/d", "/s", "/c", command], {
    encoding: "utf8",
    windowsHide: true,
  });
}

const cases = [
  { name: "direct", run: runDirect },
  { name: "affinity-only", run: () => runStart(["/affinity", affinityMaskHex]) },
  { name: "high-only", run: () => runStart(["/high"]) },
  {
    name: "high-plus-affinity",
    run: () => runStart(["/high", "/affinity", affinityMaskHex]),
  },
  {
    name: "abovenormal-plus-affinity",
    run: () => runStart(["/abovenormal", "/affinity", affinityMaskHex]),
  },
] as const;

console.log("CP4-AQ1 Windows launch local diagnostic");
console.log(`Platform:    ${process.platform}`);
console.log(`Bun path:    ${process.execPath}`);
console.log(`Affinity:    0x${affinityMaskHex}`);
console.log("");

for (const testCase of cases) {
  const result = testCase.run();
  console.log(`[${testCase.name}]`);
  console.log(`status: ${String(result.status)}`);
  console.log(`signal: ${String(result.signal)}`);
  console.log(`error:  ${result.error?.message ?? "<none>"}`);
  console.log(`stdout: ${result.stdout.trim() || "<empty>"}`);
  console.log(`stderr: ${result.stderr.trim() || "<empty>"}`);
  console.log("");
}

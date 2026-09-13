import { spawnSync } from "node:child_process";

const affinityMaskHex = "400";
const timeoutMs = 10_000;

function runDirect() {
  return spawnSync(process.execPath, ["--version"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: timeoutMs,
  });
}

type Mode = "affinity" | "high" | "high-affinity" | "abovenormal-affinity";

function runPowerShell(mode: Mode) {
  const bunPath = process.execPath.replaceAll("'", "''");
  const setAffinity = mode === "affinity" || mode.endsWith("affinity");
  const priority =
    mode === "high" || mode === "high-affinity"
      ? "High"
      : mode === "abovenormal-affinity"
        ? "AboveNormal"
        : null;

  const commands = [
    "$ErrorActionPreference = 'Stop'",
    `$p = Start-Process -FilePath '${bunPath}' -ArgumentList @('-e', 'setTimeout(()=>{},5000)') -PassThru -WindowStyle Hidden`,
    "Start-Sleep -Milliseconds 150",
  ];

  if (setAffinity) {
    commands.push(
      `try { $p.ProcessorAffinity = [IntPtr]0x${affinityMaskHex}; Write-Output ('affinity=OK mask=0x${affinityMaskHex}') } catch { Write-Output ('affinity=FAIL ' + $_.Exception.Message) }`,
    );
  }

  if (priority !== null) {
    commands.push(
      `try { $p.PriorityClass = '${priority}'; Write-Output ('priority=OK ${priority}') } catch { Write-Output ('priority=FAIL ' + $_.Exception.Message) }`,
    );
  }

  commands.push(
    "try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}",
    "Write-Output 'diagnostic=COMPLETE'",
  );

  return spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", commands.join("; ")],
    {
      encoding: "utf8",
      windowsHide: true,
      timeout: timeoutMs,
    },
  );
}

const cases = [
  { name: "direct", run: runDirect },
  { name: "affinity-only", run: () => runPowerShell("affinity") },
  { name: "high-only", run: () => runPowerShell("high") },
  {
    name: "high-plus-affinity",
    run: () => runPowerShell("high-affinity"),
  },
  {
    name: "abovenormal-plus-affinity",
    run: () => runPowerShell("abovenormal-affinity"),
  },
] as const;

console.log("CP4-AQ1 Windows launch local diagnostic v2");
console.log(`Platform:    ${process.platform}`);
console.log(`Bun path:    ${process.execPath}`);
console.log(`Affinity:    0x${affinityMaskHex}`);
console.log(`Timeout:     ${timeoutMs} ms/case`);
console.log("");

for (const testCase of cases) {
  console.log(`[${testCase.name}] starting`);
  const result = testCase.run();
  console.log(`status: ${String(result.status)}`);
  console.log(`signal: ${String(result.signal)}`);
  console.log(`error:  ${result.error?.message ?? "<none>"}`);
  console.log(`stdout: ${result.stdout.trim() || "<empty>"}`);
  console.log(`stderr: ${result.stderr.trim() || "<empty>"}`);
  console.log("");
}

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_COMMAND_LIMITS, SUPERVISOR_GRACE_MS, type CommandLimits } from "./command_limits";
import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { COMMAND_FILES, stopOwnedGroup, type CommandResult } from "./command_process";
import type { Verdict } from "./criteria_support";

const PRIVATE_FILE_MODE = 0o600;
const TEXT_ENCODING = "utf8";
const PIPE_OUTPUT = "pipe";
const RECEIPT_PREFIX = "orly-command-";

export function runCommand(root: string, command: string[], limits: CommandLimits = DEFAULT_COMMAND_LIMITS): Verdict {
  const receipt = mkdtempSync(join(tmpdir(), RECEIPT_PREFIX));
  const request = join(receipt, "request.json");
  writeFileSync(request, JSON.stringify({ command, limits, receipt, parent_pid: process.pid }), { mode: PRIVATE_FILE_MODE });
  const supervisor = Bun.spawnSync([process.execPath, join(import.meta.dir, "command_process.ts"), request], {
    cwd: root, env: UNSCOPED_ENVIRONMENT, stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT,
    detached: true, timeout: limits.timeout_ms + SUPERVISOR_GRACE_MS, killSignal: "SIGKILL",
  });
  if (supervisor.exitCode !== 0) {
    stopOwnedGroup(supervisor.pid);
    try { stopOwnedGroup(Number(readFileSync(join(receipt, COMMAND_FILES.pid), TEXT_ENCODING))); } catch { /* child may not have started */ }
    return { ok: false, status: supervisor.signalCode ? "cancelled" : "blocked", detail: `command supervisor failed (${supervisor.signalCode ?? supervisor.exitCode}); complete captured output: ${receipt}; ${supervisor.stderr.toString().trim()}` };
  }
  const result: CommandResult = JSON.parse(readFileSync(join(receipt, COMMAND_FILES.result), TEXT_ENCODING));
  if (result.failure) return { ok: false, status: result.failure_kind === "invocation" ? "blocked" : result.failure_kind === "cancelled" ? "cancelled" : "failed", detail: `${result.failure}; ${result.elapsed_ms} ms / ${limits.timeout_ms} ms deadline; ${result.output_bytes} bytes / ${limits.output_bytes} bytes output budget; complete captured output: ${receipt}` };
  const output = [COMMAND_FILES.stdout, COMMAND_FILES.stderr].map((file) => readFileSync(join(receipt, file), TEXT_ENCODING)).filter(Boolean).join("\n");
  rmSync(receipt, { recursive: true, force: true });
  return { ok: result.exit_code === 0, status: result.exit_code === 0 ? "passed" : "failed", detail: output ? `exit ${result.exit_code}:\n${output}` : result.exit_code === 0 ? "exit 0" : `exit ${result.exit_code}: no output` };
}

export function runCommandGroup(root: string, invocations: string[][], limits: CommandLimits): Verdict {
  if (invocations.length === 0 || invocations.some((argv) => argv.length === 0)) return { ok: false, status: "blocked", detail: "command group contains no executable invocation" };
  const evidence: string[] = [];
  for (const [index, argv] of invocations.entries()) {
    let result: Verdict;
    try { result = runCommand(root, argv, limits); }
    catch (error) { result = { ok: false, status: "blocked", detail: `invocation unavailable: ${String(error)}` }; }
    evidence.push(`${argv.join(" ")} -> ${result.detail}`);
    if (!result.ok) {
      for (const unrun of invocations.slice(index + 1)) evidence.push(`${unrun.join(" ")} -> not_run`);
      return { ...result, detail: evidence.join("\n") };
    }
  }
  return { ok: true, status: "passed", detail: `${invocations.length} invocation(s) exit 0\n${evidence.join("\n")}` };
}

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
    return { ok: false, detail: `command supervisor failed (${supervisor.signalCode ?? supervisor.exitCode}); complete captured output: ${receipt}; ${supervisor.stderr.toString().trim()}` };
  }
  const result: CommandResult = JSON.parse(readFileSync(join(receipt, COMMAND_FILES.result), TEXT_ENCODING));
  if (result.failure) return { ok: false, detail: `${result.failure}; ${result.elapsed_ms} ms / ${limits.timeout_ms} ms deadline; ${result.output_bytes} bytes / ${limits.output_bytes} bytes output budget; complete captured output: ${receipt}` };
  const output = [COMMAND_FILES.stdout, COMMAND_FILES.stderr].map((file) => readFileSync(join(receipt, file), TEXT_ENCODING)).filter(Boolean).join("\n").trim();
  rmSync(receipt, { recursive: true, force: true });
  return { ok: result.exit_code === 0, detail: output ? `exit ${result.exit_code}:\n${output}` : result.exit_code === 0 ? "exit 0" : `exit ${result.exit_code}: no output` };
}

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CommandLimits } from "./command_limits";

const PRIVATE_FILE_MODE = 0o600;
const TEXT_ENCODING = "utf8";
const KILL_SIGNAL = "SIGKILL";
const MISSING_PROCESS = "ESRCH";
// macOS refuses to signal a group whose members have all exited but are not
// yet reaped, as a command that ended just as its deadline came; that group,
// like a missing one, needs no stopping.
const EXITED_GROUP = "EPERM";
const PIPE_OUTPUT = "pipe";
const OWNER_POLL_MS = 100;
const TERMINATION_SIGNALS = ["SIGTERM", "SIGINT", "SIGHUP"] as const;
export const COMMAND_FILES = {
  result: "result.json", pid: "child.pid", stdout: "stdout.log", stderr: "stderr.log",
} as const;

type Request = { command: string[]; limits: CommandLimits; receipt: string; parent_pid: number };
export type CommandResult = { exit_code: number | null; elapsed_ms: number; output_bytes: number; failure?: string; failure_kind?: "invocation" | "limit" | "cancelled" };

export function stopOwnedGroup(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("invalid owned process group");
  try { process.kill(-pid, KILL_SIGNAL); }
  catch (error) { if (!hasErrorCode(error, MISSING_PROCESS) && !hasErrorCode(error, EXITED_GROUP)) throw error; }
}

async function capture(stream: ReadableStream<Uint8Array>, file: string, onBytes: (size: number) => void): Promise<void> {
  for await (const chunk of stream) {
    appendFileSync(file, chunk);
    onBytes(chunk.byteLength);
  }
}

async function run(request: Request): Promise<CommandResult> {
  const started = performance.now();
  const stdout = join(request.receipt, COMMAND_FILES.stdout);
  const stderr = join(request.receipt, COMMAND_FILES.stderr);
  for (const file of [stdout, stderr]) writeFileSync(file, "", { mode: PRIVATE_FILE_MODE });
  let child;
  try {
    child = Bun.spawn(request.command, { detached: true, stdin: "ignore", stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT });
  } catch (error) {
    return { exit_code: null, elapsed_ms: Math.ceil(performance.now() - started), output_bytes: 0, failure_kind: "invocation", failure: `${request.command[0] ?? "command"} could not be run: ${messageOf(error)}` };
  }
  let stopped = false;
  try {
    writeFileSync(join(request.receipt, COMMAND_FILES.pid), String(child.pid), { mode: PRIVATE_FILE_MODE });
    let outputBytes = 0;
    let failure: string | undefined;
    let failureKind: "limit" | "cancelled" | undefined;
    // The first reason to stop wins, and says whether a limit or a cancellation stopped it.
    const stop = (reason: string, kind: "limit" | "cancelled" = "cancelled") => {
      failure ??= reason;
      failureKind ??= kind;
      if (stopped) return;
      stopOwnedGroup(child.pid);
      stopped = true;
    };
    const timer = setTimeout(() => stop("deadline exceeded", "limit"), request.limits.timeout_ms);
    const owner = setInterval(() => {
      try { process.kill(request.parent_pid, 0); }
      catch (error) { if (hasErrorCode(error, MISSING_PROCESS)) stop("gate owner exited"); }
    }, OWNER_POLL_MS);
    const signals = TERMINATION_SIGNALS.map((signal) => {
      const handler = () => stop(`supervisor received ${signal}`);
      process.on(signal, handler);
      return { signal, handler };
    });
    try {
      const onBytes = (size: number) => {
        outputBytes += size;
        if (outputBytes > request.limits.output_bytes) stop("output limit exceeded", "limit");
      };
      await Promise.all([capture(child.stdout, stdout, onBytes), capture(child.stderr, stderr, onBytes), child.exited]);
      if (child.signalCode) failure ??= `stopped by ${child.signalCode}`;
      return { exit_code: child.exitCode, elapsed_ms: Math.ceil(performance.now() - started), output_bytes: outputBytes, ...(failure ? { failure, failure_kind: failureKind ?? "cancelled" } : {}) };
    } finally {
      clearTimeout(timer);
      clearInterval(owner);
      for (const { signal, handler } of signals) process.off(signal, handler);
    }
  } finally {
    if (!stopped) stopOwnedGroup(child.pid);
    await child.exited;
  }
}

if (import.meta.main) {
  const request: Request = JSON.parse(readFileSync(Bun.argv[2]!, TEXT_ENCODING));
  const result = await run(request);
  writeFileSync(join(request.receipt, COMMAND_FILES.result), JSON.stringify(result), { mode: PRIVATE_FILE_MODE });
}

// This module also runs alone as the supervisor process, so it imports no
// runtime value; model.ts's two error helpers are restated here for that reason.
function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

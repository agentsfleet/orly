import type { BunFile } from "bun";
import type { Environment } from "./settings";

import pLimit from "p-limit";

import { stopOwnedGroup } from "../command_process";
import { OrlyError } from "../model";

type Stopped = "deadline" | "cancelled";
// A child killed by a signal it was not sent by orly has no exit code: it was
// interrupted, which is never a lane's own answer.
export type Outcome = { code: number } | { stopped: Stopped | "interrupted" };
export type Captured = { code: number; stdout: string; stderr: string };
type StreamOptions = {
  env: Environment;
  stdin?: Blob | BunFile;
  // Standard output goes to this file instead of the line sink, for a binary
  // stream such as a results archive.
  stdoutFile?: string;
  lines: (line: string) => void;
  deadline: number;
  signal: AbortSignal;
};

// A line with no newline in sight is flushed at this size, so a child that
// prints a progress bar forever cannot grow one string without bound.
const MAX_LINE_CHARS = 64 * 1024;
// Captured output feeds a JSON parser or one summary field; anything bigger is
// a misbehaving command, refused rather than buffered.
const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
const PIPE = "pipe";
const OP_TIMEOUT_MS = 60_000;
// 1Password reads run this many at a time: a lane's secrets resolve in parallel
// without flooding the op daemon.
const OP_READS_AT_ONCE = 4;
// A machine that has not booted, or answered SSH, within this long never
// will, so these waits end well inside a run's deadline.
export const MACHINE_WAIT_MS = 10 * 60_000;

// One long-running child, in its own process group so a deadline or a
// cancellation stops everything it started, with output streamed line by line.
export async function streamProcess(argv: string[], options: StreamOptions): Promise<Outcome> {
  if (options.signal.aborted) return { stopped: "cancelled" };
  if (Date.now() >= options.deadline) return { stopped: "deadline" };
  const child = Bun.spawn([locate(argv, options.env), ...argv.slice(1)], {
    env: options.env, stdin: options.stdin ?? "ignore", detached: true,
    stdout: options.stdoutFile ? Bun.file(options.stdoutFile) : PIPE, stderr: PIPE,
  });
  let stopped: Stopped | undefined;
  const stop = (reason: Stopped) => {
    stopped ??= reason;
    stopOwnedGroup(child.pid);
  };
  const timer = setTimeout(() => stop("deadline"), Math.max(0, options.deadline - Date.now()));
  const cancel = () => stop("cancelled");
  if (options.signal.aborted) cancel();
  else options.signal.addEventListener("abort", cancel, { once: true });
  try {
    const stdout = child.stdout instanceof ReadableStream ? streamLines(child.stdout, options.lines) : undefined;
    await Promise.all([stdout, streamLines(child.stderr, options.lines), child.exited]);
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", cancel);
    // Reaps anything the child left running in its group after it exited.
    stopOwnedGroup(child.pid);
    await child.exited;
  }
  if (stopped) return { stopped };
  return child.exitCode === null ? { stopped: "interrupted" } : { code: child.exitCode };
}

// One short command whose output is read whole: `git`, `tar`, `ssh` probes.
// It runs in its own process group, so a Ctrl-C at the terminal reaches orly
// alone; only the signal passed here stops it, which is how cleanup commands,
// handed no signal, still finish after a cancellation.
export async function captureProcess(argv: string[], options: { env: Environment; timeoutMs: number; stdin?: Blob | BunFile; signal?: AbortSignal }): Promise<Captured> {
  if (options.signal?.aborted) throw new OrlyError("cancelled before command launch");
  const child = Bun.spawn([locate(argv, options.env), ...argv.slice(1)], {
    env: options.env, stdin: options.stdin ?? "ignore", stdout: PIPE, stderr: PIPE, detached: true,
  });
  let stopped: Stopped | undefined;
  const stop = (reason: Stopped) => {
    stopped ??= reason;
    stopOwnedGroup(child.pid);
  };
  const timer = setTimeout(() => stop("deadline"), options.timeoutMs);
  const cancel = () => stop("cancelled");
  options.signal?.addEventListener("abort", cancel, { once: true });
  try {
    const exited = child.exited.then(() => stopOwnedGroup(child.pid));
    const [stdout, stderr] = await Promise.all([readBounded(child.stdout, MAX_CAPTURE_BYTES, outputTooLarge), readBounded(child.stderr, MAX_CAPTURE_BYTES, outputTooLarge), exited]);
    const stoppedBy = stopped ?? child.signalCode;
    return { code: stopped ? -1 : child.exitCode ?? -1, stdout, stderr: `${stderr}${stoppedBy ? `\n${argv[0]} stopped by ${stoppedBy}` : ""}` };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    stopOwnedGroup(child.pid);
    await child.exited;
  }
}

// A poll interval that a cancellation cuts short.
export async function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  let wake = () => {};
  const woken = new Promise<void>((resolve) => { wake = resolve; });
  const timer = setTimeout(wake, ms);
  signal.addEventListener("abort", wake, { once: true });
  try {
    await woken;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", wake);
  }
}


export function machineDeadline(job: { deadline: number }, now = Date.now()): number {
  return Math.min(job.deadline, now + MACHINE_WAIT_MS);
}

// Polls until the probe answers, the deadline passes or the run is cancelled;
// the last two throw, naming what was awaited.
export async function until<T>(what: string, probe: () => Promise<T | undefined>, options: { deadline: number; signal: AbortSignal; pollMs: number }): Promise<T> {
  for (;;) {
    if (options.signal.aborted) throw new OrlyError(`cancelled while waiting for ${what}`);
    if (Date.now() >= options.deadline) throw new OrlyError(`the deadline passed while waiting for ${what}`);
    const value = await probe();
    if (value !== undefined) return value;
    await pause(options.pollMs, options.signal);
  }
}

// Each `burst.secrets` variable, on the machine that runs `orly burst`. A value
// already in the environment is used as it is, which is how a CI job's secret
// loader hands them over; anything else is read with `op read`, signed in or
// through OP_SERVICE_ACCOUNT_TOKEN. The values live in the returned map and
// nowhere else: never printed, never an argument, never a file. A failure
// names the variable and op's complaint, which carries the reference only.
export async function resolveSecrets(references: Record<string, string>, env: Environment): Promise<Environment> {
  const limit = pLimit(OP_READS_AT_ONCE);
  const reads = await Promise.all(Object.entries(references).map(([name, reference]) => limit(async () => {
    const preset = env[name];
    if (preset) return { name, value: preset };
    const read = await captureProcess(["op", "read", "--no-newline", reference], { env, timeoutMs: OP_TIMEOUT_MS });
    return read.code === 0 ? { name, value: read.stdout } : { name, error: `could not read the secret for ${name}: ${read.stderr.trim().split("\n")[0] ?? ""}` };
  })));
  // The first failure in declaration order, so the message does not depend on timing.
  const failed = reads.find((read) => "error" in read);
  if (failed && "error" in failed) throw new OrlyError(failed.error);
  return Object.fromEntries(reads.map((read) => [read.name, "value" in read ? read.value : undefined]));
}

// Reads a stream whole, refusing it past `limit` bytes with the caller's error.
async function readBounded(stream: ReadableStream<Uint8Array>, limit: number, tooLarge: () => Error): Promise<string> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.byteLength;
    if (size > limit) throw tooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Bun.spawn resolves a bare name against this process's PATH, not the
// environment handed to the child; resolving it here makes the two agree.
function locate(argv: string[], env: Environment): string {
  const name = argv[0];
  if (!name) throw new OrlyError("empty command");
  if (name.includes("/")) return name;
  const found = Bun.which(name, { PATH: env.PATH ?? "" });
  if (!found) throw new OrlyError(`${name} is not on PATH`);
  return found;
}

async function streamLines(stream: ReadableStream<Uint8Array>, write: (line: string) => void): Promise<void> {
  const decoder = new TextDecoder();
  let pending = "";
  for await (const chunk of stream) {
    pending += decoder.decode(chunk, { stream: true });
    const parts = pending.split("\n");
    pending = parts.pop() ?? "";
    for (const line of parts) write(line);
    if (pending.length > MAX_LINE_CHARS) {
      write(pending);
      pending = "";
    }
  }
  pending += decoder.decode();
  if (pending) write(pending);
}



function outputTooLarge(): Error {
  return new OrlyError(`command output exceeded ${MAX_CAPTURE_BYTES} bytes`);
}

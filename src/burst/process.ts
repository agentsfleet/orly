import type { BunFile } from "bun";
import type { Environment } from "./settings";

import { stopOwnedGroup } from "../command_process";
import { OrlyError } from "../model";

export type Stopped = "deadline" | "cancelled";
export type Outcome = { code: number } | { stopped: Stopped };
export type Captured = { code: number; stdout: string; stderr: string };
export type StreamOptions = {
  env: Environment;
  cwd?: string;
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

// One long-running child, in its own process group so a deadline or a
// cancellation stops everything it started, with output streamed line by line.
export async function streamProcess(argv: string[], options: StreamOptions): Promise<Outcome> {
  const child = Bun.spawn([locate(argv, options.env), ...argv.slice(1)], {
    env: options.env, stdin: options.stdin ?? "ignore", detached: true,
    stdout: options.stdoutFile ? Bun.file(options.stdoutFile) : PIPE, stderr: PIPE,
    ...(options.cwd ? { cwd: options.cwd } : {}),
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
  }
  return stopped ? { stopped } : { code: child.exitCode ?? 1 };
}

// One short command whose output is read whole: an `aws` query, `git`, `tar`.
// It runs in its own process group, so a Ctrl-C at the terminal reaches orly
// alone; only the signal passed here stops it, which is how cleanup commands,
// handed no signal, still finish after a cancellation.
export async function captureProcess(argv: string[], options: { env: Environment; timeoutMs: number; cwd?: string; stdin?: Blob | BunFile; signal?: AbortSignal }): Promise<Captured> {
  const child = Bun.spawn([locate(argv, options.env), ...argv.slice(1)], {
    env: options.env, stdin: options.stdin ?? "ignore", stdout: PIPE, stderr: PIPE, detached: true,
    timeout: options.timeoutMs, killSignal: "SIGKILL", ...(options.cwd ? { cwd: options.cwd } : {}),
  });
  const cancel = () => child.kill("SIGKILL");
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  try {
    const [stdout, stderr] = await Promise.all([readBounded(child.stdout), readBounded(child.stderr), child.exited]);
    const stoppedBy = child.signalCode ? `\n${argv[0]} stopped by ${child.signalCode}` : "";
    return { code: child.exitCode ?? -1, stdout, stderr: `${stderr}${stoppedBy}` };
  } finally {
    options.signal?.removeEventListener("abort", cancel);
    child.kill("SIGKILL");
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
  const values: Environment = {};
  for (const [name, reference] of Object.entries(references)) {
    const preset = env[name];
    if (preset) {
      values[name] = preset;
      continue;
    }
    const read = await captureProcess(["op", "read", "--no-newline", reference], { env, timeoutMs: OP_TIMEOUT_MS });
    if (read.code !== 0) throw new OrlyError(`could not read the secret for ${name}: ${read.stderr.trim().split("\n")[0] ?? ""}`);
    values[name] = read.stdout;
  }
  return values;
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

async function readBounded(stream: ReadableStream<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.byteLength;
    if (size > MAX_CAPTURE_BYTES) throw new OrlyError(`command output exceeded ${MAX_CAPTURE_BYTES} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

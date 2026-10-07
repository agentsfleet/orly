import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { SUPERVISOR_GRACE_MS, type CommandLimits } from "../../../src/command_limits";
import { COMMAND_FILES, stopOwnedGroup } from "../../../src/command_process";
import { OrlyError } from "../../../src/model";
import { IGNORE_OUTPUT, KIBIBYTE, MAX_SOURCE_BYTES, MAX_STATE_BYTES, PRIVATE_FILE_MODE } from "../../../src/judgments/constants";
import { containedFile, digest, readBounded } from "../../../src/judgments/files";
import { createOwnership, verifyOwnership, type EvaluationOwnership } from "./recovery";

export const EXECUTION_ERROR = "Task receipt differs from actual evaluator-owned execution.";
export const TASK_LIMITS = { timeout_ms: 15_000, output_bytes: 64 * KIBIBYTE } as const;
const SUPERVISOR_PATH = join(import.meta.dir, "../../../src/command_process.ts");
const REQUEST_FILE = "request.json";
const COMMAND_PREFIX = "command-";
const ABORT_EVENT = "abort";
const TERMINATE = "SIGTERM";
const KILL = "SIGKILL";
const SUPERVISOR_FAILURE = "Execution supervisor did not produce a complete result.";
const OUTPUT_UNAVAILABLE = "Captured output exceeded the bounded report budget.";
const MAX_COMMANDS = 64;
const executionInput = z.strictObject({ command: z.array(z.string().min(1).max(MAX_STATE_BYTES)).min(1).max(32),
  sources: z.array(z.string().min(1).max(MAX_STATE_BYTES)).max(16),
  limits: z.strictObject({ timeout_ms: z.number().int().positive().max(TASK_LIMITS.timeout_ms),
    output_bytes: z.number().int().positive().max(TASK_LIMITS.output_bytes) }) });
const MAX_CAPTURE_BYTES = 4 * KIBIBYTE * KIBIBYTE;
const resultSchema = z.strictObject({ exit_code: z.number().int().nullable(), elapsed_ms: z.number().int().nonnegative(),
  output_bytes: z.number().int().nonnegative(), failure: z.string().min(1).max(MAX_STATE_BYTES).optional() });
export type ExecutedReceipt = {
  command: string[]; source_before: string; source_after: string; command_digest: string;
  result: z.infer<typeof resultSchema>; stdout: string; stderr: string; child_pid: number | null;
  stdout_digest: string; stderr_digest: string; receipt_directory: string;
};

export class EvaluationRun {
  #ownership: EvaluationOwnership;
  #records = new Map<string, string>();
  #closed = false;
  #active = false;

  private constructor(ownership: EvaluationOwnership) { this.#ownership = ownership; }
  static async create(): Promise<EvaluationRun> { return new EvaluationRun(await createOwnership()); }
  get workspace(): string { return this.#ownership.workspace; }
  get ownership(): Readonly<EvaluationOwnership> { return Object.freeze({ ...this.#ownership }); }

  async execute(command: string[], sources: string[], limits: CommandLimits = TASK_LIMITS,
    signal?: AbortSignal, environment: Record<string, string> = {}): Promise<ExecutedReceipt> {
    if (this.#closed || this.#active || signal?.aborted || this.#records.size >= MAX_COMMANDS ||
      !executionInput.safeParse({ command, sources, limits }).success) throw new OrlyError(EXECUTION_ERROR);
    this.#active = true;
    let receipt: string | undefined;
    let supervisor: ReturnType<typeof Bun.spawn> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let supervisorExited = false;
    const abort = () => supervisor?.kill(TERMINATE);
    signal?.addEventListener(ABORT_EVENT, abort, { once: true });
    try {
      const sourceBefore = await sourceIdentity(this.workspace, sources);
      if (signal?.aborted) throw new OrlyError(EXECUTION_ERROR);
      receipt = mkdtempSync(join(this.#ownership.receipts, COMMAND_PREFIX));
      const request = join(receipt, REQUEST_FILE);
      await Bun.write(request, JSON.stringify({ command, limits, receipt, parent_pid: process.pid }), { mode: PRIVATE_FILE_MODE });
      if (signal?.aborted) throw new OrlyError(EXECUTION_ERROR);
      supervisor = Bun.spawn([process.execPath, SUPERVISOR_PATH, request], { cwd: this.workspace, detached: true,
        env: { PATH: Bun.env.PATH, ...environment }, stdin: IGNORE_OUTPUT, stdout: IGNORE_OUTPUT, stderr: IGNORE_OUTPUT });
      timer = setTimeout(() => supervisor?.kill(KILL), limits.timeout_ms + SUPERVISOR_GRACE_MS);
      const exit = await supervisor.exited;
      supervisorExited = true;
      const result = exit === 0 && existsSync(join(receipt, COMMAND_FILES.result))
        ? resultSchema.parse(JSON.parse(await readBounded(join(receipt, COMMAND_FILES.result), MAX_SOURCE_BYTES)))
        : { exit_code: null, elapsed_ms: 0, output_bytes: 0, failure: SUPERVISOR_FAILURE };
      const stdout = await capturedOutput(join(receipt, COMMAND_FILES.stdout));
      const stderr = await capturedOutput(join(receipt, COMMAND_FILES.stderr));
      const childPid = existsSync(join(receipt, COMMAND_FILES.pid)) ? Number(await readBounded(join(receipt, COMMAND_FILES.pid), MAX_SOURCE_BYTES)) : null;
      const executed = { command: [...command], source_before: sourceBefore, source_after: await sourceIdentity(this.workspace, sources),
        command_digest: digest(JSON.stringify(command)), result, stdout, stderr, child_pid: childPid,
        stdout_digest: digest(stdout), stderr_digest: digest(stderr), receipt_directory: receipt };
      this.#records.set(receipt, digest(JSON.stringify(executed)));
      return structuredClone(executed);
    } finally {
      try {
        if (timer !== undefined) clearTimeout(timer);
        signal?.removeEventListener(ABORT_EVENT, abort);
        if (supervisor) {
          if (!supervisorExited) supervisor.kill(KILL);
          await supervisor.exited;
        }
        if (receipt !== undefined) {
          await stopReceiptChild(receipt);
          rmSync(receipt, { recursive: true, force: true });
        }
      } finally { this.#active = false; }
    }
  }

  verify(receipt: ExecutedReceipt): void {
    if (this.#records.get(receipt.receipt_directory) !== digest(JSON.stringify(receipt))) throw new OrlyError(EXECUTION_ERROR);
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    if (this.#active) throw new OrlyError(EXECUTION_ERROR);
    await verifyOwnership(this.#ownership);
    rmSync(this.#ownership.workspace, { recursive: true, force: true });
    rmSync(this.#ownership.receipts, { recursive: true, force: true });
    this.#closed = true;
    this.#records.clear();
  }
}

export async function sourceIdentity(root: string, sources: string[]): Promise<string> {
  const selected: Array<{ path: string; digest: string | null }> = [];
  for (const path of sources) selected.push({ path, digest: existsSync(join(root, path)) ? digest(await readBounded(containedFile(root, path), MAX_SOURCE_BYTES)) : null });
  return digest(JSON.stringify(selected));
}

async function capturedOutput(path: string): Promise<string> {
  if (!existsSync(path)) return "";
  try { return await readBounded(path, MAX_CAPTURE_BYTES); }
  catch { return OUTPUT_UNAVAILABLE; }
}

async function stopReceiptChild(receipt: string): Promise<void> {
  if (!existsSync(join(receipt, COMMAND_FILES.pid))) return;
  const pid = Number(await readBounded(join(receipt, COMMAND_FILES.pid), MAX_SOURCE_BYTES));
  if (Number.isSafeInteger(pid) && pid > 0) stopOwnedGroup(pid);
}

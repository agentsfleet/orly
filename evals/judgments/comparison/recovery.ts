import { chmodSync, lstatSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { z } from "zod";

import { OrlyError } from "../../../src/model";
import { KIBIBYTE, MAX_SOURCE_BYTES, PIPE_OUTPUT, PRIVATE_DIRECTORY_MODE, PRIVATE_FILE_MODE } from "../../../src/judgments/constants";
import { digest, readBounded } from "../../../src/judgments/files";

export const OWNED_PREFIX = { workspace: "orly-eval-work-", receipts: "orly-eval-receipts-" } as const;
export const OWNER_FILE = ".evaluation-owner.json";
export const OWNER_ERROR = "Evaluation recovery cannot verify exclusive stale ownership.";
const PROCESS_MISSING = "ESRCH";
const PROCESS_ERROR_CODE = "code";
const OWNER_KIND = "bounded-evaluation-owner";
const FINGERPRINT_TIMEOUT_MS = 1_000;
const FINGERPRINT_COMMAND = ["ps", "-o", "lstart=", "-p"];
const MAX_COMMAND_RECEIPTS = 128;
const CHILD_PID_FILE = "child.pid";
const ownerSchema = z.strictObject({ kind: z.literal(OWNER_KIND), token: z.string().uuid(), pid: z.number().int().positive(),
  fingerprint: z.string().min(1).max(256), workspace: z.string().min(1).max(KIBIBYTE), receipts: z.string().min(1).max(KIBIBYTE) });
export type EvaluationOwnership = z.infer<typeof ownerSchema>;

export function processFingerprint(pid: number): string | null {
  const result = Bun.spawnSync([...FINGERPRINT_COMMAND, String(pid)], { stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT, timeout: FINGERPRINT_TIMEOUT_MS });
  return result.exitCode === 0 && result.stdout.byteLength > 0 ? result.stdout.toString().trim() : null;
}

export async function createOwnership(): Promise<EvaluationOwnership> {
  const fingerprint = processFingerprint(process.pid);
  if (!fingerprint) throw new OrlyError(OWNER_ERROR);
  let workspace: string | undefined;
  let receipts: string | undefined;
  try {
    workspace = mkdtempSync(join(tmpdir(), OWNED_PREFIX.workspace));
    receipts = mkdtempSync(join(tmpdir(), OWNED_PREFIX.receipts));
    for (const path of [workspace, receipts]) chmodSync(path, PRIVATE_DIRECTORY_MODE);
    const ownership = { kind: OWNER_KIND, token: crypto.randomUUID(), pid: process.pid, fingerprint, workspace, receipts };
    for (const path of [workspace, receipts]) {
      await Bun.write(join(path, OWNER_FILE), JSON.stringify(ownership), { mode: PRIVATE_FILE_MODE });
    }
    return ownerSchema.parse(ownership);
  } catch (error) {
    if (workspace !== undefined) rmSync(workspace, { recursive: true, force: true });
    if (receipts !== undefined) rmSync(receipts, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyOwnership(value: unknown): Promise<EvaluationOwnership> {
  const parsed = ownerSchema.safeParse(value);
  if (!parsed.success) throw new OrlyError(OWNER_ERROR);
  const ownership = parsed.data;
  const temporaryRoot = realpathSync(tmpdir());
  for (const [path, prefix] of [[ownership.workspace, OWNED_PREFIX.workspace], [ownership.receipts, OWNED_PREFIX.receipts]]) {
    if (!path || !prefix) throw new OrlyError(OWNER_ERROR);
    const status = lstatSync(path);
    if (!status.isDirectory() || status.isSymbolicLink() || status.uid !== process.getuid?.() ||
      dirname(realpathSync(path)) !== temporaryRoot || !basename(path).startsWith(prefix)) throw new OrlyError(OWNER_ERROR);
    const marker = await readBounded(join(path, OWNER_FILE), MAX_SOURCE_BYTES);
    if (digest(marker) !== digest(JSON.stringify(ownership))) throw new OrlyError(OWNER_ERROR);
  }
  return ownership;
}

export async function recoverStaleOwnership(value: unknown): Promise<{ recovered: true; completion: false }> {
  const ownership = await verifyOwnership(value);
  try {
    process.kill(ownership.pid, 0);
    const fingerprint = processFingerprint(ownership.pid);
    if (fingerprint === null || fingerprint === ownership.fingerprint) throw new OrlyError(OWNER_ERROR);
  } catch (error) {
    if (error instanceof OrlyError) throw error;
    if (!(error instanceof Error) || !(PROCESS_ERROR_CODE in error) || error[PROCESS_ERROR_CODE] !== PROCESS_MISSING) throw new OrlyError(OWNER_ERROR);
  }
  await verifyNoRunningChildren(ownership.receipts);
  rmSync(ownership.workspace, { recursive: true, force: true });
  rmSync(ownership.receipts, { recursive: true, force: true });
  return { recovered: true, completion: false };
}

async function verifyNoRunningChildren(receipts: string): Promise<void> {
  const entries = readdirSync(receipts, { withFileTypes: true });
  if (entries.length > MAX_COMMAND_RECEIPTS) throw new OrlyError(OWNER_ERROR);
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new OrlyError(OWNER_ERROR);
    if (!entry.isDirectory()) continue;
    const path = join(receipts, entry.name, CHILD_PID_FILE);
    if (!await Bun.file(path).exists()) continue;
    const pid = Number(await readBounded(path, MAX_SOURCE_BYTES));
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new OrlyError(OWNER_ERROR);
    // The supervisor starts a detached group; its leader can exit first.
    try { process.kill(-pid, 0); throw new OrlyError(OWNER_ERROR); }
    catch (error) {
      if (error instanceof OrlyError) throw error;
      if (!(error instanceof Error) || !(PROCESS_ERROR_CODE in error) || error[PROCESS_ERROR_CODE] !== PROCESS_MISSING) throw new OrlyError(OWNER_ERROR);
    }
  }
}

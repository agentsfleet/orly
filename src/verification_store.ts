import type { Verdict } from "./criteria_support";

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync, mkdirSync, rmdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

import { contentDigest } from "./config";
import { DEFAULT_COMMAND_OUTPUT_BYTES } from "./command_limits";
import { gitOutput } from "./git_env";

type Completion = z.infer<typeof completionSchema>;
export type Attempt = { path: string; id: string; key: Uint8Array; previous?: string };
export type VerifiedPass = { detail: string; executedAt: number; origin: string };

const MANIFEST_BYTES = 64 * 1024;
const KEY_BYTES = 32;
const ENCODING = "utf8";
const COMPLETE = "complete.json";
const OUTPUT = "output.log";
const ATTEMPT_NAME = /^\d{12}-[0-9a-f-]{36}$/;
const completionSchema = z.object({
  id: z.string(), binding: z.string().nullable(),
  executed_at: z.number().int().nonnegative(), origin: z.string(),
  status: z.enum(["passed", "failed", "blocked", "cancelled"]), output_digest: z.string(),
}).strict();
const signedSchema = z.object({ payload: completionSchema, signature: z.string() }).strict();

export function verificationState(root: string): string {
  const path = gitOutput(root, ["rev-parse", "--git-path", "orly-verification"]);
  if (!path) throw new Error("verification needs Git-owned private state");
  const state = resolve(root, path);
  privateDirectory(state);
  return state;
}

export function beginAttempt(state: string, lane: string): Attempt {
  const parent = join(state, contentDigest(lane).slice("sha256:".length));
  privateDirectory(parent);
  syncDirectory(state);
  const names = readdirSync(parent).sort();
  const supported = names.every((name) => ATTEMPT_NAME.test(name));
  const latest = names.filter((name) => ATTEMPT_NAME.test(name)).at(-1);
  const sequence = latest ? Number(latest.slice(0, 12)) + 1 : 1;
  if (sequence > 999_999_999_999) throw new Error("verification history sequence exhausted");
  const id = `${String(sequence).padStart(12, "0")}-${randomUUID()}`;
  const path = join(parent, id);
  privateDirectory(path);
  syncDirectory(path);
  syncDirectory(parent);
  const key = signingKey(state);
  return { path, id, key, ...(supported && latest ? { previous: join(parent, latest) } : {}) };
}

export function previousPass(attempt: Attempt, binding: string, maxAge: number): VerifiedPass | undefined {
  if (!attempt.previous) return undefined;
  try {
    const file = join(attempt.previous, COMPLETE);
    const directory = lstatSync(attempt.previous);
    if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077) !== 0) return undefined;
    requirePrivateFile(file, MANIFEST_BYTES);
    const record = signedSchema.parse(JSON.parse(readFileSync(file, ENCODING)));
    const payload = record.payload;
    const expected = signature(payload, attempt.key);
    if (record.signature.length !== expected.length || !timingSafeEqual(Buffer.from(record.signature), Buffer.from(expected))) return undefined;
    const now = Date.now();
    if (payload.status !== "passed" || payload.binding !== binding || payload.id !== attempt.previous.split(/[\\/]/).at(-1)) return undefined;
    if (now < payload.executed_at || now - payload.executed_at > maxAge) return undefined;
    const output = join(attempt.previous, OUTPUT);
    requirePrivateFile(output);
    const detail = readFileSync(output, ENCODING);
    if (contentDigest(detail) !== payload.output_digest) return undefined;
    return { detail, executedAt: payload.executed_at, origin: payload.origin };
  } catch { return undefined; }
}

export function completeAttempt(attempt: Attempt, binding: string | undefined, result: Verdict, reused?: VerifiedPass): void {
  if (result.status && result.ok !== (result.status === "passed")) throw new Error("inconsistent native verification outcome");
  const payload = completionSchema.parse({
    id: attempt.id, binding: binding ?? null, executed_at: reused?.executedAt ?? Date.now(),
    origin: reused?.origin ?? attempt.id, status: result.status ?? (result.ok ? "passed" : "failed"),
    output_digest: contentDigest(result.detail),
  });
  if (existsSync(join(attempt.path, COMPLETE))) throw new Error("verification completion is immutable");
  writeDurable(join(attempt.path, OUTPUT), result.detail);
  const temporary = join(attempt.path, "completion.tmp");
  writeDurable(temporary, JSON.stringify({ payload, signature: signature(payload, attempt.key) }));
  renameSync(temporary, join(attempt.path, COMPLETE));
  syncDirectory(attempt.path);
}

export class VerificationLock {
  readonly #path: string;
  readonly #owner: string;
  #retained = false;

  constructor(state: string) {
    this.#path = join(state, "lock");
    try { mkdirSync(this.#path, { mode: 0o700 }); }
    catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      throw new Error(`verification is already running or interrupted; confirm workloads stopped before clearing ${state}`);
    }
    this.#owner = join(this.#path, `${process.pid}.${randomUUID()}`);
    try { writeFileSync(this.#owner, String(process.pid), { flag: "wx", mode: 0o600 }); }
    catch (error) { rmdirSync(this.#path); throw error; }
  }

  abandon(): void { this.#retained = true; }
  release(): void { if (!this.#retained) { unlinkSync(this.#owner); rmdirSync(this.#path); } }
}

function signature(payload: Completion, key: Uint8Array): string {
  return `hmac-sha256:${createHmac("sha256", key).update(JSON.stringify(payload)).digest("hex")}`;
}

function signingKey(state: string): Uint8Array {
  const path = join(state, "signing.key");
  if (!existsSync(path)) {
    writeDurable(path, randomBytes(KEY_BYTES));
    syncDirectory(state);
  }
  requirePrivateFile(path, KEY_BYTES);
  const key = readFileSync(path);
  if (key.byteLength !== KEY_BYTES) throw new Error("verification signing key is invalid");
  return key;
}

function requirePrivateFile(path: string, maxBytes = DEFAULT_COMMAND_OUTPUT_BYTES): void {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.size > maxBytes) throw new Error("verification record must be a bounded private file");
}

function writeDurable(path: string, value: string | Uint8Array): void {
  writeFileSync(path, value, { flag: "wx", mode: 0o600 });
  const descriptor = openSync(path, "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function syncDirectory(path: string): void {
  const descriptor = openSync(path, "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function privateDirectory(path: string): void {
  try { mkdirSync(path, { mode: 0o700 }); }
  catch (error) { if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error; }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error("verification state must be a private directory");
}

import type { Verdict } from "./criteria_support";
import type { VerificationProof } from "./verification_identity";

import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync, mkdirSync, rmdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

import { contentDigest } from "./config";
import { DEFAULT_COMMAND_OUTPUT_BYTES } from "./command_limits";
import { gitOutput } from "./git_env";
import { hasErrorCode, hashContent } from "./model";

export type Proof = Omit<z.infer<typeof proofSchema>, "format">;
export type Attempt = { path: string; id: string; key: Uint8Array; previous?: string };
export type VerifiedPass = { detail: string; executedAt: number; origin: string; revision: string; uncommitted: boolean };

const MANIFEST_BYTES = 64 * 1024;
const KEY_BYTES = 32;
const ENCODING = "utf8";
const COMPLETE = "complete.json";
const OUTPUT = "output.log";
const PROOFS = "proofs";
const SIGNING_KEY = "signing.key";
const ATTEMPT_NAME = /^\d{12}-[0-9a-f-]{36}$/;
// Format 2 keys evidence to tracked content, so a format 1 record, keyed to a
// revision, never parses and its lane runs fresh.
const completionSchema = z.object({
  format: z.literal(2),
  id: z.string(), binding: z.string().nullable(),
  executed_revision: z.string().nullable(), executed_uncommitted: z.boolean(), accepted_revision: z.string().nullable(), scope: z.string().nullable(),
  executed_at: z.number().int().nonnegative(), origin: z.string(),
  status: z.enum(["passed", "failed", "blocked", "cancelled"]), output_digest: z.string(),
}).strict();
const signedSchema = z.object({ payload: completionSchema, signature: z.string() }).strict();
// What orly saw when a test failed with the change it covers reverted.
const proofSchema = z.object({
  format: z.literal(1), file: z.string(), test: z.string(), command: z.array(z.string()).min(1),
  failing_line: z.string(), mutation: z.string(), revision: z.string(), recorded_at: z.number().int().nonnegative(),
}).strict();
const signedProofSchema = z.object({ payload: proofSchema, signature: z.string() }).strict();

export function verificationState(root: string): string {
  const state = statePath(root);
  privateDirectory(state);
  return state;
}

// One signed record per test, replaced by the next proof of the same test.
export function saveProof(root: string, proof: Proof): void {
  const state = verificationState(root);
  const parent = join(state, PROOFS);
  privateDirectory(parent);
  const payload = proofSchema.parse({ format: 1, ...proof });
  const path = proofPath(state, proof.file, proof.test);
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  writeDurable(temporary, JSON.stringify({ payload, signature: signature(payload, signingKey(state)) }));
  renameSync(temporary, path);
  syncDirectory(parent);
}

// Reading creates nothing: a repository that never recorded a proof keeps no
// private state, and an unsigned, altered or misplaced record proves nothing.
export function hasProof(root: string, file: string, test: string): boolean {
  try {
    const state = statePath(root);
    const key = join(state, SIGNING_KEY);
    if (!existsSync(key)) return false;
    const path = proofPath(state, file, test);
    requirePrivateFile(path);
    requirePrivateFile(key, KEY_BYTES);
    const record = signedProofSchema.parse(JSON.parse(readFileSync(path, ENCODING)));
    return record.payload.file === file && record.payload.test === test && sameSignature(record.signature, signature(record.payload, readFileSync(key)));
  } catch { return false; }
}

export function beginAttempt(state: string, lane: string): Attempt {
  const parent = join(state, hashContent(lane));
  privateDirectory(parent);
  syncDirectory(state);
  const names = readdirSync(parent).sort();
  const supported = names.every((name) => ATTEMPT_NAME.test(name));
  const latest = names.filter((name) => ATTEMPT_NAME.test(name)).at(-1);
  const sequence = latest ? Number(latest.slice(0, 12)) + 1 : 1;
  if (sequence > 999_999_999_999) throw new Error("verification history sequence exhausted");
  const id = `${String(sequence).padStart(12, "0")}-${crypto.randomUUID()}`;
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
    if (!sameSignature(record.signature, expected)) return undefined;
    const now = Date.now();
    if (payload.status !== "passed" || payload.binding !== binding || !payload.executed_revision || payload.id !== attempt.previous.split(/[\\/]/).at(-1)) return undefined;
    if (now < payload.executed_at || now - payload.executed_at > maxAge) return undefined;
    const output = join(attempt.previous, OUTPUT);
    requirePrivateFile(output);
    const detail = readFileSync(output, ENCODING);
    if (contentDigest(detail) !== payload.output_digest) return undefined;
    return { detail, executedAt: payload.executed_at, origin: payload.origin, revision: payload.executed_revision, uncommitted: payload.executed_uncommitted };
  } catch { return undefined; }
}

export function completeAttempt(attempt: Attempt, proof: VerificationProof | undefined, result: Verdict, reused?: VerifiedPass): void {
  if (result.status && result.ok !== (result.status === "passed")) throw new Error("inconsistent native verification outcome");
  const payload = completionSchema.parse({
    format: 2, id: attempt.id, binding: proof?.binding ?? null, executed_at: reused?.executedAt ?? Date.now(),
    executed_revision: reused?.revision ?? proof?.revision ?? null, executed_uncommitted: reused?.uncommitted ?? proof?.uncommitted ?? false,
    accepted_revision: proof?.revision ?? null, scope: proof?.scope ?? null,
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
      if (!hasErrorCode(error, "EEXIST")) throw error;
      throw new Error(`verification is already running or interrupted; confirm workloads stopped before clearing ${state}`);
    }
    this.#owner = join(this.#path, `${process.pid}.${crypto.randomUUID()}`);
    try { writeFileSync(this.#owner, String(process.pid), { flag: "wx", mode: 0o600 }); }
    catch (error) { rmdirSync(this.#path); throw error; }
  }

  abandon(): void { this.#retained = true; }
  release(): void { if (!this.#retained) { unlinkSync(this.#owner); rmdirSync(this.#path); } }
}

function statePath(root: string): string {
  const path = gitOutput(root, ["rev-parse", "--git-path", "orly-verification"]);
  if (!path) throw new Error("verification needs Git-owned private state");
  return resolve(root, path);
}

function proofPath(state: string, file: string, test: string): string {
  return join(state, PROOFS, `${hashContent(`${file}\0${test}`)}.json`);
}

function signature(payload: object, key: Uint8Array): string {
  return `hmac-sha256:${new Bun.CryptoHasher("sha256", key).update(JSON.stringify(payload)).digest("hex")}`;
}

// Constant time in what matters: both sides are compared as HMACs under a
// key made for this comparison, so how long the comparison takes reveals
// nothing about the stored signature.
function sameSignature(stored: string, expected: string): boolean {
  const key = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const digest = (value: string) => new Bun.CryptoHasher("sha256", key).update(value).digest("hex");
  return digest(stored) === digest(expected);
}

function signingKey(state: string): Uint8Array {
  const path = join(state, SIGNING_KEY);
  if (!existsSync(path)) {
    writeDurable(path, crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
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
  catch (error) { if (!hasErrorCode(error, "EEXIST")) throw error; }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error("verification state must be a private directory");
}

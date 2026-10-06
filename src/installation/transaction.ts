import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, lstatSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { z } from "zod";
import { assertWritableInside, applyMode, OrlyError, MODE_REGULAR, MODE_EXECUTABLE } from "../model";
import { contentDigest } from "../config";
import { hooksPath } from "./hooks";

const JOURNAL = ".orly/install-journal.json";
const MAX_JOURNAL_BYTES = 16 * 1024 * 1024;
const JSON_INDENT = 2;
const ENCODING = "utf8";
const CONTENT_ENCODING = "base64";
const OBSOLETE_FILE = "obsolete managed file";
const JOURNAL_SIZE_ERROR = "installation journal exceeds its size budget";
const regularPath = z.string().min(1).refine((path) => !isAbsolute(path) && !path.split(/[\\/]/).some((part) => part === ".." || !part) && !path.includes("\0"));
const writeSchema = z.object({ path: regularPath, before: z.string().nullable(), content: z.string(), mode: z.enum([MODE_REGULAR, MODE_EXECUTABLE]) }).strict();
const deleteSchema = z.object({ path: regularPath, before: z.string() }).strict();
const hooksSchema = z.object({ before: z.string().nullable(), after: z.string() }).strict().nullable();
const journalSchema = z.object({ version: z.string(), writes: z.array(writeSchema), deletes: z.array(deleteSchema), hooks: hooksSchema }).strict();
export type FileWrite = z.infer<typeof writeSchema>;
export type FileDelete = z.infer<typeof deleteSchema>;
export type HooksChange = z.infer<typeof hooksSchema>;
type Journal = z.infer<typeof journalSchema>;
export type InstallCheckpoint = (stage: string, ordinal: number) => void;

// A crash may leave either the old bytes or the intended new bytes at a path.
// Anything else is an owner edit and must stop recovery before further writes.
export class InstallTransaction {
  readonly #root: string;
  readonly #version: string;
  readonly #checkpoint: InstallCheckpoint | undefined;
  constructor(root: string, version: string, checkpoint?: InstallCheckpoint) {
    this.#root = root;
    this.#version = version;
    this.#checkpoint = checkpoint;
  }

  recover(configureHooks: () => void): boolean {
    assertWritableInside(this.#root, JOURNAL, "installation journal");
    const path = join(this.#root, JOURNAL);
    if (!existsSync(path)) return false;
    if (lstatSync(path).size > MAX_JOURNAL_BYTES) throw new OrlyError(JOURNAL_SIZE_ERROR);
    const envelope = z.object({ digest: z.string(), data: journalSchema }).strict().parse(JSON.parse(readFileSync(path, ENCODING)));
    if (envelope.digest !== contentDigest(Buffer.from(JSON.stringify(envelope.data)))) throw new OrlyError("installation journal integrity mismatch");
    if (envelope.data.version !== this.#version) throw new OrlyError("resume installation with the same package version recorded in the journal");
    this.apply(envelope.data, configureHooks);
    return true;
  }

  commit(writes: FileWrite[], deletes: FileDelete[], hooks: HooksChange, configureHooks: () => void): void {
    const data = journalSchema.parse({ version: this.#version, writes, deletes, hooks });
    this.validate(data);
    const bytes = Buffer.from(JSON.stringify({ digest: contentDigest(Buffer.from(JSON.stringify(data))), data }, undefined, JSON_INDENT));
    if (bytes.length > MAX_JOURNAL_BYTES) throw new OrlyError(JOURNAL_SIZE_ERROR);
    atomicWrite(this.#root, JOURNAL, bytes, MODE_REGULAR);
    this.#checkpoint?.("journal", 0);
    this.apply(data, configureHooks);
  }

  private validate(data: Journal): void {
    this.validateHooks(data.hooks);
    const paths = [...data.writes.map((file) => file.path), ...data.deletes.map((file) => file.path)];
    if (new Set(paths).size !== paths.length || paths.includes(JOURNAL)) throw new OrlyError("installation journal contains overlapping operations");
    for (const file of data.writes) {
      assertWritableInside(this.#root, file.path, "installation destination");
      const current = diskDigest(this.#root, file.path);
      const next = contentDigest(Buffer.from(file.content, CONTENT_ENCODING));
      if (current !== file.before && current !== next) throw new OrlyError(`installation conflict: ${file.path} changed after planning`);
    }
    for (const file of data.deletes) {
      assertWritableInside(this.#root, file.path, OBSOLETE_FILE);
      const current = diskDigest(this.#root, file.path);
      if (current !== null && current !== file.before) throw new OrlyError(`migration conflict: ${file.path} changed before cleanup`);
    }
  }

  private validateHooks(hooks: HooksChange): void {
    if (!hooks) return;
    const current = hooksPath(this.#root);
    if (current !== hooks.before && current !== hooks.after) throw new OrlyError("installation conflict: hooks setting changed after planning");
  }

  private apply(data: Journal, configureHooks: () => void): void {
    this.validate(data);
    for (const [index, file] of data.writes.entries()) {
      const bytes = Buffer.from(file.content, CONTENT_ENCODING);
      const current = diskDigest(this.#root, file.path);
      if (current !== file.before && current !== contentDigest(bytes)) throw new OrlyError(`installation conflict: ${file.path}`);
      if (current !== contentDigest(bytes)) atomicWrite(this.#root, file.path, bytes, file.mode);
      else applyMode(join(this.#root, file.path), file.mode);
      this.#checkpoint?.("write", index);
    }
    this.validateHooks(data.hooks);
    if (data.hooks) configureHooks();
    this.#checkpoint?.("metadata", 0);
    for (const [index, file] of data.deletes.entries()) {
      assertWritableInside(this.#root, file.path, OBSOLETE_FILE);
      const current = diskDigest(this.#root, file.path);
      if (current !== null && current !== file.before) throw new OrlyError(`migration conflict: ${file.path}`);
      if (current !== null) unlinkSync(join(this.#root, file.path));
      this.#checkpoint?.("delete", index);
    }
    unlinkSync(join(this.#root, JOURNAL));
  }
}

export function diskDigest(root: string, path: string): string | null {
  assertWritableInside(root, path, "installation input");
  const file = join(root, path);
  if (!existsSync(file)) return null;
  if (!lstatSync(file).isFile()) throw new OrlyError(`installation requires a regular file: ${path}`);
  return contentDigest(readFileSync(file));
}

function atomicWrite(root: string, path: string, content: Uint8Array, mode: string): void {
  assertWritableInside(root, path, "installation write");
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = `${destination}.orly-pending`;
  assertWritableInside(root, `${path}.orly-pending`, "installation temporary");
  if (existsSync(temporary)) {
    if (diskDigest(root, `${path}.orly-pending`) !== contentDigest(content)) throw new OrlyError(`installation temporary conflicts: ${path}.orly-pending`);
  } else writeFileSync(temporary, content, { flag: "wx" });
  applyMode(temporary, mode);
  renameSync(temporary, destination);
}

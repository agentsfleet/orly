import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertWritableInside, OrlyError } from "../model";

const LOCK = ".orly/install.lock";
const ENCODING = "utf8";
const OWNER_NAME = /^(\d+)\.[a-f0-9-]{36}$/;
const INCOMPLETE = "installation lock is incomplete; inspect it before removing it";
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function recoverDeadOwner(root: string, path: string): void {
  if (!lstatSync(path).isDirectory()) throw new OrlyError(INCOMPLETE);
  const entries = readdirSync(path);
  const owner = entries.length === 1 ? entries[0]! : "";
  const match = OWNER_NAME.exec(owner);
  if (!match) throw new OrlyError(INCOMPLETE);
  const ownerPath = join(path, owner);
  assertWritableInside(root, `${LOCK}/${owner}`, "installation lock owner");
  const pid = Number(match[1]);
  if (!Number.isSafeInteger(pid) || pid <= 0 || !lstatSync(ownerPath).isFile() || readFileSync(ownerPath, ENCODING) !== String(pid)) throw new OrlyError(INCOMPLETE);
  try { process.kill(pid, 0); throw new OrlyError("another installation owns this repository"); }
  catch (error) { if (!isCode(error, "ESRCH")) throw error; }
  // A replacement owner has a different filename. Losing this exact removal
  // race stops recovery before it can remove the replacement directory.
  unlinkSync(ownerPath);
  rmdirSync(path);
}

export function installationLock(root: string): () => void {
  assertWritableInside(root, LOCK, "installation lock");
  mkdirSync(join(root, ".orly"), { recursive: true });
  const path = join(root, LOCK);
  try { mkdirSync(path, { mode: PRIVATE_DIRECTORY_MODE }); }
  catch (error) {
    if (!isCode(error, "EEXIST")) throw error;
    recoverDeadOwner(root, path);
    mkdirSync(path, { mode: PRIVATE_DIRECTORY_MODE });
  }
  const ownerPath = join(path, `${process.pid}.${randomUUID()}`);
  try { writeFileSync(ownerPath, String(process.pid), { flag: "wx", mode: PRIVATE_FILE_MODE }); }
  catch (error) {
    rmdirSync(path);
    throw error;
  }
  return () => {
    if (readFileSync(ownerPath, ENCODING) !== String(process.pid)) throw new OrlyError("installation lock ownership changed");
    unlinkSync(ownerPath);
    rmdirSync(path);
  };
}

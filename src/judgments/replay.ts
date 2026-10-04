import type { Prepared } from "./types";

import { closeSync, existsSync, lstatSync, mkdirSync, openSync, realpathSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

import { OrlyError } from "../model";
import { MAX_REPLAY_BYTES, PRIVATE_DIRECTORY_MODE, PRIVATE_FILE_MODE, REPLAY_DIRECTORY } from "./constants";
import { digest, readBounded } from "./files";
import { parseReply, type Reply } from "./wire";

const identity = z.string().regex(/^[a-f0-9]{64}$/);
const replaySchema = z.strictObject({ identity, reply: z.unknown(), checksum: identity, elapsedMs: z.number().finite().nonnegative() });

export function replayDirectory(root: string, create: boolean): string {
  let directory = realpathSync(root);
  for (const part of REPLAY_DIRECTORY.split("/")) {
    directory = join(directory, part);
    if (!existsSync(directory)) {
      if (!create) return directory;
      mkdirSync(directory, { mode: PRIVATE_DIRECTORY_MODE });
    }
    const status = lstatSync(directory);
    if (!status.isDirectory() || status.isSymbolicLink()) throw new OrlyError("Replay directory must be a real directory inside the project.");
  }
  return directory;
}

export async function readReplay(root: string, prepared: Prepared): Promise<{ reply: Reply; elapsedMs: number }> {
  const path = replayPath(replayDirectory(root, false), prepared);
  if (!existsSync(path)) throw new OrlyError("No exact replay for these inputs. Use --refresh to permit scanned source upload.");
  const raw = await readBounded(path, MAX_REPLAY_BYTES);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new OrlyError("Replay is not valid JSON."); }
  const parsed = replaySchema.safeParse(value);
  if (!parsed.success) throw new OrlyError("Replay schema is invalid.");
  const record = parsed.data;
  if (record.identity !== prepared.identity || record.checksum !== digest(JSON.stringify(record.reply))) throw new OrlyError("Replay identity or integrity does not match.");
  return { reply: parseReply(record.reply, prepared), elapsedMs: record.elapsedMs };
}

export async function writeReplay(root: string, prepared: Prepared, reply: Reply, elapsedMs: number): Promise<void> {
  const path = replayDestination(root, prepared);
  const temporary = join(dirname(path), `.pending-${Bun.randomUUIDv7()}`);
  const descriptor = openSync(temporary, "wx", PRIVATE_FILE_MODE);
  try {
    await Bun.write(Bun.file(descriptor), JSON.stringify({ identity: prepared.identity, reply, checksum: digest(JSON.stringify(reply)), elapsedMs }));
    renameSync(temporary, path);
  } finally {
    closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function replayDestination(root: string, prepared: Prepared): string {
  const path = replayPath(replayDirectory(root, true), prepared);
  const status = lstatSync(path, { throwIfNoEntry: false });
  if (status?.isSymbolicLink()) throw new OrlyError("Replay file must not be a symlink.");
  if (status && !status.isFile()) throw new OrlyError("Replay file must be a regular file.");
  return path;
}

function replayPath(directory: string, prepared: Prepared): string {
  if (!identity.safeParse(prepared.identity).success) throw new OrlyError("Replay identity is invalid.");
  return join(directory, `${prepared.identity}.json`);
}

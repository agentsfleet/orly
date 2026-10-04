import { closeSync, constants, fstatSync, openSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { isBelow, OrlyError } from "../model";
import { SHA256, UTF8 } from "./constants";

const ABORT_EVENT = "abort";
const CANCELED_REASON = "Stream reading was canceled.";

export function digest(value: string): string {
  return new Bun.CryptoHasher(SHA256).update(value).digest("hex");
}

export function containedFile(root: string, path: string): string {
  if (isAbsolute(path)) throw new OrlyError("Evidence paths must be relative to the project.");
  const candidate = resolve(root, path);
  if (!isBelow(candidate, root)) throw new OrlyError("Evidence path escapes the project.");
  try {
    const actual = realpathSync(candidate);
    if (!isBelow(actual, realpathSync(root))) throw new OrlyError("Evidence symlink escapes the project.");
    return actual;
  } catch (error) {
    if (error instanceof OrlyError) throw error;
    throw new OrlyError("Selected evidence file is unavailable.");
  }
}

export async function readBounded(path: string, limit: number): Promise<string> {
  // Bun lacks a no-follow open flag; the descriptor pins a regular file for Bun's bounded stream.
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const status = fstatSync(descriptor);
    if (!status.isFile()) throw new OrlyError("Selected evidence must be a regular file.");
    if (status.size > limit) throw new OrlyError("Selected file exceeds the byte budget; select a smaller complete unit.");
    return await readStream(Bun.file(descriptor).stream(), limit);
  } catch (error) {
    if (error instanceof OrlyError) throw error;
    throw new OrlyError("Cannot read the selected file safely.");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export async function readStream(stream: ReadableStream<Uint8Array>, limit: number, signal?: AbortSignal): Promise<string> {
  const reader = stream.getReader();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener(ABORT_EVENT, abort, { once: true });
  const decoder = new TextDecoder(UTF8, { fatal: true });
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      if (signal?.aborted) throw new OrlyError(CANCELED_REASON);
      const next = await reader.read();
      if (signal?.aborted) throw new OrlyError(CANCELED_REASON);
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > limit) throw new OrlyError("Stream exceeds the byte budget.");
      chunks.push(decoder.decode(next.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    signal?.removeEventListener(ABORT_EVENT, abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

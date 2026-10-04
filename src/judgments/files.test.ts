import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { containedFile, readBounded, readStream } from "./files";
import { KIBIBYTE } from "./constants";
import { SOURCE_FILE, TestProject } from "./test_support";

test("reads bounded UTF-8 without losing multibyte content", async () => {
  using project = new TestProject();
  project.write(SOURCE_FILE, "Indy — 🦉");
  expect(await readBounded(join(project.root, SOURCE_FILE), 32)).toBe("Indy — 🦉");
});

test("rejects traversal and absolute evidence paths", () => {
  using project = new TestProject();
  expect(() => containedFile(project.root, "../outside.ts")).toThrow("Evidence path escapes the project.");
  expect(() => containedFile(project.root, "/outside.ts")).toThrow("Evidence paths must be relative to the project.");
});

test("rejects a symlink escaping the selected project", () => {
  using project = new TestProject();
  using outside = new TestProject();
  symlinkSync(join(outside.root, SOURCE_FILE), join(project.root, "escape.ts"));
  expect(() => containedFile(project.root, "escape.ts")).toThrow("Evidence symlink escapes the project.");
});

test("refuses symlink reads and non-regular files", async () => {
  using project = new TestProject();
  symlinkSync(join(project.root, SOURCE_FILE), join(project.root, "link.ts"));
  mkdirSync(join(project.root, "directory"));
  await expect(readBounded(join(project.root, "link.ts"), KIBIBYTE)).rejects.toThrow("Cannot read the selected file safely.");
  await expect(readBounded(join(project.root, "directory"), KIBIBYTE)).rejects.toThrow("Selected evidence must be a regular file.");
});

test("refuses oversized and invalid UTF-8 files", async () => {
  using project = new TestProject();
  await expect(readBounded(join(project.root, SOURCE_FILE), 1)).rejects.toThrow("Selected file exceeds the byte budget");
  writeFileSync(join(project.root, SOURCE_FILE), new Uint8Array([0xff]));
  await expect(readBounded(join(project.root, SOURCE_FILE), KIBIBYTE)).rejects.toThrow("Cannot read the selected file safely.");
});

test("bounds streaming bytes and cancels the stream on refusal", async () => {
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(20)); },
    cancel() { canceled = true; },
  });
  await expect(readStream(stream, 10)).rejects.toThrow("Stream exceeds the byte budget.");
  expect(canceled).toBe(true);
});

test("aborting a waiting stream releases its reader", async () => {
  const controller = new AbortController();
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { canceled = true; } });
  const pending = readStream(stream, 20, controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow("Stream reading was canceled.");
  expect(canceled).toBe(true);
  expect(stream.locked).toBe(false);
});

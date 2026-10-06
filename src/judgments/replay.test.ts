import { expect, test } from "bun:test";
import { readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import { REPLAY_DIRECTORY } from "./constants";
import { readReplay, replayDirectory, writeReplay } from "./replay";
import { choiceReply, SOURCE, SOURCE_FILE, TestProject } from "./test_support";

test("replays validated exact evidence without storing source", async () => {
  using project = new TestProject();
  const prepared = await project.prepare();
  await writeReplay(project.root, prepared, choiceReply(), 12);
  expect(await readReplay(project.root, prepared)).toEqual({ reply: choiceReply(), elapsedMs: 12 });
  const contents = readFileSync(join(project.root, REPLAY_DIRECTORY, `${prepared.identity}.json`), "utf8");
  expect(contents).not.toContain("DateTimeFormat");
  expect(contents).not.toContain("TYPESAFE_API_KEY");
});

test("rejects a missing exact replay after source changes", async () => {
  using project = new TestProject();
  const prepared = await project.prepare();
  await writeReplay(project.root, prepared, choiceReply(), 12);
  project.write(SOURCE_FILE, SOURCE.replace('month: "short"', 'month: "long"'));
  await expect(readReplay(project.root, await project.prepare())).rejects.toThrow("No exact replay for these inputs.");
});

test("rejects corrupted replay checksum and invalid JSON", async () => {
  using project = new TestProject();
  const prepared = await project.prepare();
  await writeReplay(project.root, prepared, choiceReply(), 12);
  const path = join(REPLAY_DIRECTORY, `${prepared.identity}.json`);
  project.write(path, JSON.stringify({ identity: prepared.identity, reply: choiceReply(), checksum: "0".repeat(64), elapsedMs: 12 }));
  await expect(readReplay(project.root, prepared)).rejects.toThrow("Replay identity or integrity does not match.");
  project.write(path, "{");
  await expect(readReplay(project.root, prepared)).rejects.toThrow("Replay is not valid JSON.");
});

test("rejects a cache directory that redirects outside the project", () => {
  using project = new TestProject();
  using outside = new TestProject();
  symlinkSync(outside.root, join(project.root, ".orly"));
  expect(() => replayDirectory(project.root, true)).toThrow("Replay directory must be a real directory inside the project.");
});

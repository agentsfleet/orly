import { expect, test } from "bun:test";

import { existsSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import { OrlyError } from "../model";
import { REPLAY_DIRECTORY } from "./constants";
import { prepareItem } from "./evidence";
import { replayDirectory } from "./replay";
import { judge } from "./runner";
import { choiceReply, SOURCE, SOURCE_FILE, TestProject } from "./test_support";

test("live evidence becomes exact offline replay without another request", async () => {
  using project = new TestProject();
  let requests = 0;
  let scans = 0;
  const dependencies = { credential: "test-credential", scan: async () => { scans++; }, fetch: async () => { requests++; return Response.json(choiceReply()); } };
  const live = await judge(project.root, project.manifest(), true, dependencies);
  expect(live.requests).toBe(1);
  expect(live.results[0]).toMatchObject({ status: "complete", mode: "live", assessment: { concern: true, decision: "weak" } });
  const replay = await judge(project.root, project.manifest(), false, dependencies);
  expect(replay.requests).toBe(0);
  expect(replay.results[0]).toMatchObject({ status: "complete", mode: "replay" });
  expect(requests).toBe(1);
  expect(scans).toBe(1);
  expect(replay.results[0]?.status === "complete" && replay.results[0].answer).toEqual(live.results[0]?.status === "complete" && live.results[0].answer);
});

test("missing replay never falls through to live inference", async () => {
  using project = new TestProject();
  let calls = 0;
  const result = await judge(project.root, project.manifest(), false, { credential: "unused", scan: async () => { calls++; }, fetch: async () => { calls++; return Response.json(choiceReply()); } });
  expect(result.results[0]).toMatchObject({ status: "incomplete", requests: 0 });
  expect(result.requests).toBe(0);
  expect(calls).toBe(0);
  expect(existsSync(join(project.root, REPLAY_DIRECTORY))).toBe(false);
});

test("missing credentials or failed scanning prevent all uploads", async () => {
  using project = new TestProject();
  let uploads = 0;
  const send = async () => { uploads++; return Response.json(choiceReply()); };
  const missing = await judge(project.root, project.manifest(), true, { credential: undefined, scan: async () => {}, fetch: send });
  expect(missing.results[0]).toMatchObject({ status: "incomplete", requests: 0 });
  const refused = await judge(project.root, project.manifest(), true, { credential: "test-value", scan: async () => { throw new OrlyError("Scanner refused input."); }, fetch: send });
  expect(refused.results[0]).toMatchObject({ status: "incomplete", reason: "Scanner refused input.", requests: 0 });
  expect(uploads).toBe(0);
  expect(existsSync(join(project.root, REPLAY_DIRECTORY))).toBe(false);
});

test("an invalid later item stops the whole batch before upload", async () => {
  using project = new TestProject();
  let calls = 0;
  const item = { ...project.item(), id: "missing", evidence: project.item().evidence.map((reference) => ({ ...reference, path: "missing.ts" })) };
  const report = await judge(project.root, { stage: "verify", items: [project.item(), item] }, true, { credential: "unused", scan: async () => { calls++; }, fetch: async () => { calls++; return Response.json(choiceReply()); } });
  expect(report.requests).toBe(0);
  expect(report.results.every((result) => result.status === "incomplete")).toBe(true);
  expect(calls).toBe(0);
});

test.each([true, false])("a replay symlink stops the whole batch before upload, target exists: %s", async (targetExists) => {
  using project = new TestProject();
  using outside = new TestProject();
  const blocked = { ...project.item(), id: "blocked", requirement: `${project.item().requirement} Include the requested locale.` };
  const prepared = await prepareItem(project.root, blocked);
  const target = join(outside.root, targetExists ? SOURCE_FILE : "absent.json");
  symlinkSync(target, join(replayDirectory(project.root, true), `${prepared.identity}.json`));
  let uploads = 0;
  const report = await judge(project.root, { stage: "verify", items: [project.item(), blocked] }, true, {
    credential: "unused", scan: async () => {}, fetch: async () => { uploads++; return Response.json(choiceReply()); },
  });
  expect(report.requests).toBe(0);
  expect(uploads).toBe(0);
  expect(report.results).toHaveLength(2);
  for (const result of report.results) expect(result).toMatchObject({ status: "incomplete", requests: 0, reason: "Replay file must not be a symlink." });
});

test("a directory at a later replay filename stops the whole batch before upload", async () => {
  using project = new TestProject();
  const blocked = { ...project.item(), id: "blocked", requirement: `${project.item().requirement} Include the requested locale.` };
  const prepared = await prepareItem(project.root, blocked);
  mkdirSync(join(replayDirectory(project.root, true), `${prepared.identity}.json`));
  let uploads = 0;
  const report = await judge(project.root, { stage: "verify", items: [project.item(), blocked] }, true, {
    credential: "unused", scan: async () => {}, fetch: async () => { uploads++; return Response.json(choiceReply()); },
  });
  expect(report.requests).toBe(0);
  expect(uploads).toBe(0);
  expect(report.results).toHaveLength(2);
  for (const result of report.results) expect(result).toMatchObject({ status: "incomplete", requests: 0, reason: "Replay file must be a regular file." });
});

test("invalid provider replies count the attempt and never create a valid replay", async () => {
  using project = new TestProject();
  const dependencies = { credential: "unused", scan: async () => {}, fetch: async () => Response.json({ model: "unexpected" }) };
  const live = await judge(project.root, project.manifest(), true, dependencies);
  expect(live.results[0]).toMatchObject({ status: "incomplete", requests: 1, usage: null });
  expect(live.requests).toBe(1);
  const replay = await judge(project.root, project.manifest(), false, dependencies);
  expect(replay.results[0]).toMatchObject({ status: "incomplete", requests: 0 });
  project.write(SOURCE_FILE, SOURCE.replace("DateTimeFormat(locale", 'DateTimeFormat("en-US"'));
  expect((await judge(project.root, project.manifest(), false, dependencies)).results[0]?.status).toBe("incomplete");
});

test("a later scanner refusal leaves every item incomplete without upload", async () => {
  using project = new TestProject();
  const later = { ...project.item(), id: "later", requirement: `${project.item().requirement} Include the requested locale.` };
  let scans = 0;
  let uploads = 0;
  const report = await judge(project.root, { stage: "verify", items: [project.item(), later] }, true, {
    credential: "unused", scan: async () => { if (++scans === 2) throw new OrlyError("Scanner refused the later input."); },
    fetch: async () => { uploads++; return Response.json(choiceReply()); },
  });
  expect(scans).toBe(2);
  expect(uploads).toBe(0);
  expect(report.requests).toBe(0);
  for (const result of report.results) expect(result).toMatchObject({ status: "incomplete", requests: 0, reason: "Scanner refused the later input." });
  expect(existsSync(join(project.root, REPLAY_DIRECTORY))).toBe(false);
});

test("a later provider refusal preserves earlier evidence and never retries", async () => {
  using project = new TestProject();
  const later = { ...project.item(), id: "later", requirement: `${project.item().requirement} Include the requested locale.` };
  const manifest = { stage: "verify" as const, items: [project.item(), later] };
  let uploads = 0;
  const dependencies = {
    credential: "unused", scan: async () => {},
    fetch: async () => ++uploads === 2 ? new Response("private detail", { status: 503 }) : Response.json(choiceReply()),
  };
  const report = await judge(project.root, manifest, true, dependencies);
  expect(uploads).toBe(2);
  expect(report.requests).toBe(2);
  expect(report.results[0]).toMatchObject({ status: "complete", requests: 1 });
  expect(report.results[1]).toMatchObject({ status: "incomplete", requests: 1, usage: null });
  const retry = await judge(project.root, manifest, false, dependencies);
  expect(retry.requests).toBe(0);
  expect(uploads).toBe(2);
  expect(retry.results[0]?.status).toBe("complete");
  expect(retry.results[1]?.status).toBe("incomplete");
});

test("a later replay failure after upload preserves usage and earlier evidence", async () => {
  using project = new TestProject();
  const later = { ...project.item(), id: "later", requirement: `${project.item().requirement} Include the requested locale.` };
  const prepared = await prepareItem(project.root, later);
  const manifest = { stage: "verify" as const, items: [project.item(), later] };
  let uploads = 0;
  const dependencies = {
    credential: "unused", scan: async () => {}, fetch: async () => {
      if (++uploads === 2) mkdirSync(join(project.root, REPLAY_DIRECTORY, `${prepared.identity}.json`));
      return Response.json(choiceReply());
    },
  };
  const report = await judge(project.root, manifest, true, dependencies);
  expect(uploads).toBe(2);
  expect(report.requests).toBe(2);
  expect(report.results[0]).toMatchObject({ status: "complete", requests: 1 });
  expect(report.results[1]).toMatchObject({ status: "incomplete", requests: 1, usage: choiceReply().usage, reason: "Replay file must be a regular file." });
  expect(readdirSync(join(project.root, REPLAY_DIRECTORY)).filter((name) => name.startsWith(".pending-"))).toEqual([]);
  const retry = await judge(project.root, manifest, false, dependencies);
  expect(retry.requests).toBe(0);
  expect(uploads).toBe(2);
  expect(retry.results[0]?.status).toBe("complete");
  expect(retry.results[1]?.status).toBe("incomplete");
});

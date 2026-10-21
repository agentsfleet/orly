import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { specFixture } from "../gates_test_support";
import { OrlyError } from "../model";
import { JUDGMENT_MODE, MODEL, REPLAY_DIRECTORY, RESULT_STATUS } from "./constants";
import { prepareSpec } from "./spec_input";
import { judgeSpec } from "./spec_runner";
import { DEFAULT_MIN_SCORE, SPEC_RUBRIC, SPEC_STATUS } from "./spec_rubric";
import { noulReply, SPEC_FILE, TestProject } from "./test_support";

const PASS = 0.97;
const CREDENTIAL = "fixture-credential";
const options = (fetcher: (request: Request) => Promise<Response>, scan = async (_request: string) => {}) => ({ fetch: fetcher, scan, credential: CREDENTIAL });
const success = async () => Response.json(noulReply(PASS));

test("six scanned live answers are saved and exactly replayed without more uploads", async () => {
  using project = new TestProject();
  project.spec();
  let scanned = 0;
  let calls = 0;
  const deps = options(async () => { calls++; expect(scanned).toBe(SPEC_RUBRIC.length); return success(); }, async () => { scanned++; });
  const live = await judgeSpec(project.root, SPEC_FILE, true, DEFAULT_MIN_SCORE, deps);
  expect(live.status).toBe(SPEC_STATUS.ready);
  expect(live.score).toBe(97);
  expect(live.requests).toBe(SPEC_RUBRIC.length);
  const cached = await judgeSpec(project.root, SPEC_FILE, false, DEFAULT_MIN_SCORE, options(async () => { throw new Error("must stay offline"); }, async () => { throw new Error("must not scan"); }));
  expect(cached.status).toBe(SPEC_STATUS.ready);
  expect(cached.mode).toBe(JUDGMENT_MODE.replay);
  expect(cached.requests).toBe(0);
  expect(cached.checks.map((check) => check.status === RESULT_STATUS.complete ? check.probabilityYes : null)).toEqual(Array(SPEC_RUBRIC.length).fill(PASS));
  expect(calls).toBe(SPEC_RUBRIC.length);
  const prepared = await prepareSpec(project.root, SPEC_FILE);
  for (const check of prepared.checks) {
    const raw = readFileSync(join(project.root, REPLAY_DIRECTORY, `${check.identity}.json`), "utf8");
    expect(raw).not.toContain(CREDENTIAL);
    expect(raw).not.toContain("Fixture content");
  }
});

test("structural failure prevents scanning and every provider request", async () => {
  using project = new TestProject();
  project.spec("## Overview\nMissing the rest.");
  let touched = 0;
  const report = await judgeSpec(project.root, SPEC_FILE, true, DEFAULT_MIN_SCORE, options(async () => { touched++; return success(); }, async () => { touched++; }));
  expect(report.status).toBe(SPEC_STATUS.review);
  expect(report.structural.passed).toBeFalse();
  expect(report.score).toBeNull();
  expect(report.requests).toBe(0);
  expect(touched).toBe(0);
});

test("a scan failure late in preflight prevents every upload", async () => {
  using project = new TestProject();
  project.spec();
  let scanned = 0;
  let calls = 0;
  const report = await judgeSpec(project.root, SPEC_FILE, true, DEFAULT_MIN_SCORE, options(async () => { calls++; return success(); }, async () => {
    if (++scanned === SPEC_RUBRIC.length) throw new OrlyError("Secret scanner failed; nothing was uploaded.");
  }));
  expect(report.status).toBe(SPEC_STATUS.incomplete);
  expect(report.reason).toContain("scanner failed");
  expect(report.requests).toBe(0);
  expect(calls).toBe(0);
});

test("a missing credential prevents scans and uploads", async () => {
  using project = new TestProject();
  project.spec();
  const report = await judgeSpec(project.root, SPEC_FILE, true, DEFAULT_MIN_SCORE, { ...options(success), credential: undefined });
  expect(report.status).toBe(SPEC_STATUS.incomplete);
  expect(report.reason).toContain("TYPESAFE_API_KEY is missing");
  expect(report.requests).toBe(0);
});

test("a provider failure preserves prior answers, stops, and never retries", async () => {
  using project = new TestProject();
  project.spec();
  let calls = 0;
  const report = await judgeSpec(project.root, SPEC_FILE, true, DEFAULT_MIN_SCORE, options(async () => ++calls === 2 ? new Response("private body", { status: 503 }) : success()));
  expect(report.status).toBe(SPEC_STATUS.incomplete);
  expect(report.score).toBeNull();
  expect(report.requests).toBe(2);
  expect(calls).toBe(2);
  expect(report.checks[0]?.status).toBe(RESULT_STATUS.complete);
  expect(report.checks[1]).toMatchObject({ status: RESULT_STATUS.incomplete, reason: expect.stringContaining("HTTP 503") });
  expect(JSON.stringify(report)).not.toContain("private body");
  const replay = await judgeSpec(project.root, SPEC_FILE, false, DEFAULT_MIN_SCORE, options(success));
  expect(replay.status).toBe(SPEC_STATUS.incomplete);
  expect(replay.requests).toBe(0);
});

test.each([
  {},
  { ...noulReply(PASS), answers: {} },
  { ...noulReply(PASS), model: "wrong-model" },
  { ...noulReply(PASS), answers: { decision: { type: "noul", noul: 1.2 } } },
])("invalid provider replies cannot produce readiness: %j", async (reply) => {
  using project = new TestProject();
  project.spec();
  const report = await judgeSpec(project.root, SPEC_FILE, true, DEFAULT_MIN_SCORE, options(async () => Response.json(reply)));
  expect(report.status).toBe(SPEC_STATUS.incomplete);
  expect(report.score).toBeNull();
  expect(report.requests).toBe(1);
  const prepared = await prepareSpec(project.root, SPEC_FILE);
  expect(existsSync(join(project.root, REPLAY_DIRECTORY, `${prepared.checks[0]?.identity}.json`))).toBeFalse();
});

test("a confident no blocks while the other five questions pass", async () => {
  using project = new TestProject();
  project.spec();
  let call = 0;
  const report = await judgeSpec(project.root, SPEC_FILE, true, DEFAULT_MIN_SCORE, options(async () => Response.json(noulReply(++call === 3 ? 0.03 : PASS))));
  expect(report.status).toBe(SPEC_STATUS.review);
  expect(report.score).toBe(3);
  expect(report.blocked).toEqual([SPEC_RUBRIC[2].id]);
});

test("changes during live requests prevent a stale passing score", async () => {
  using project = new TestProject();
  project.spec();
  const report = await judgeSpec(project.root, SPEC_FILE, true, DEFAULT_MIN_SCORE, options(async () => {
    project.write(SPEC_FILE, `${specFixture()}\nThe required outcome changed.`);
    return success();
  }));
  expect(report.model).toBe(MODEL);
  expect(report.status).toBe(SPEC_STATUS.incomplete);
  expect(report.score).toBeNull();
  expect(report.reason).toContain("changed during judgment");
  const cached = await judgeSpec(project.root, SPEC_FILE, false, DEFAULT_MIN_SCORE, options(success));
  expect(cached.status).toBe(SPEC_STATUS.incomplete);
  expect(cached.requests).toBe(0);
});

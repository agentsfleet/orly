import { afterEach, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { join } from "node:path";

import { cleanupTemporaryDirectories, newRepository } from "./gates_test_support";
import { contentDigest } from "./config";
import { beginAttempt, completeAttempt, previousPass, verificationState, type Attempt } from "./verification_store";

const LANE = "verify.unit";
const BINDING = contentDigest("fixture binding");
const PROOF = { binding: BINDING, revision: "a".repeat(40), scope: null };
const PASS = { ok: true, status: "passed" as const, detail: "fixture report: 7 checks passed" };
afterEach(() => { cleanupTemporaryDirectories(); });

function fixture(): { state: string; attempt: Attempt } {
  const state = verificationState(newRepository());
  return { state, attempt: beginAttempt(state, LANE) };
}

test("signed completion preserves private output and original execution time", () => {
  const { state, attempt } = fixture();
  completeAttempt(attempt, PROOF, PASS);
  const next = beginAttempt(state, LANE);
  const original = previousPass(next, BINDING, 3600000)!;
  expect(original.detail).toBe(PASS.detail);
  completeAttempt(next, PROOF, PASS, original);
  expect(previousPass(beginAttempt(state, LANE), BINDING, 3600000)?.executedAt).toBe(original.executedAt);
  expect(statSync(state).mode & 0o777).toBe(0o700);
  for (const path of [join(state, "signing.key"), join(attempt.path, "complete.json"), join(attempt.path, "output.log")]) expect(statSync(path).mode & 0o777).toBe(0o600);
});

test("signed provenance rejects old formats and retains original age", () => {
  const { state, attempt } = fixture();
  completeAttempt(attempt, PROOF, PASS);
  const next = beginAttempt(state, LANE);
  const original = previousPass(next, BINDING, 3600000);
  expect(original?.revision).toBe("a".repeat(40));
  completeAttempt(next, { ...PROOF, revision: "b".repeat(40) }, PASS, original);
  const record = JSON.parse(readFileSync(join(next.path, "complete.json"), "utf8"));
  expect(record.payload).toMatchObject({ format: 1, executed_revision: "a".repeat(40), accepted_revision: "b".repeat(40), executed_at: original?.executedAt });
  delete record.payload.format;
  record.signature = `hmac-sha256:${createHmac("sha256", next.key).update(JSON.stringify(record.payload)).digest("hex")}`;
  writeFileSync(join(next.path, "complete.json"), JSON.stringify(record));
  expect(previousPass(beginAttempt(state, LANE), BINDING, 3600000)).toBeUndefined();
});

test.each(["manifest", "output", "missing log", "missing key", "start marker"])("invalid_completion_never_satisfies_a_gate: %s", (kind) => {
  const { state, attempt } = fixture();
  completeAttempt(attempt, PROOF, PASS);
  if (kind === "manifest") {
    const record = JSON.parse(readFileSync(join(attempt.path, "complete.json"), "utf8"));
    record.payload.executed_at += 1;
    writeFileSync(join(attempt.path, "complete.json"), JSON.stringify(record));
  } else if (kind === "output") writeFileSync(join(attempt.path, "output.log"), "changed fixture report");
  else if (kind === "missing log") rmSync(join(attempt.path, "output.log"));
  else if (kind === "missing key") rmSync(join(state, "signing.key"));
  else renameSync(attempt.path, `${attempt.path.slice(0, -36)}${randomUUID()}`);
  expect(previousPass(beginAttempt(state, LANE), BINDING, 3600000)).toBeUndefined();
});

test("an expired completion cannot gain freshness through replay", () => {
  const clock = spyOn(Date, "now").mockReturnValue(1000);
  try {
    const { state, attempt } = fixture();
    completeAttempt(attempt, PROOF, PASS);
    clock.mockReturnValue(1500);
    const next = beginAttempt(state, LANE);
    const original = previousPass(next, BINDING, 1000)!;
    completeAttempt(next, PROOF, PASS, original);
    clock.mockReturnValue(2101);
    expect(previousPass(beginAttempt(state, LANE), BINDING, 1000)).toBeUndefined();
  } finally { clock.mockRestore(); }
});

test.each(["failed", "unfinished"])("failed_retry_preserves_prior_attempts: %s", (kind) => {
  const { state, attempt } = fixture();
  completeAttempt(attempt, PROOF, PASS);
  const before = readFileSync(join(attempt.path, "complete.json"), "utf8");
  const retry = beginAttempt(state, LANE);
  if (kind === "failed") completeAttempt(retry, PROOF, { ok: false, status: "failed", detail: "fixture failure" });
  expect(previousPass(beginAttempt(state, LANE), BINDING, 3600000)).toBeUndefined();
  expect(readFileSync(join(attempt.path, "complete.json"), "utf8")).toBe(before);
});

test("partial output publication cannot fall back to an earlier pass", () => {
  const { state, attempt } = fixture();
  completeAttempt(attempt, PROOF, PASS);
  const retry = beginAttempt(state, LANE);
  mkdirSync(join(retry.path, "completion.tmp"));
  expect(() => completeAttempt(retry, PROOF, PASS)).toThrow();
  expect(existsSync(join(retry.path, "complete.json"))).toBeFalse();
  expect(previousPass(beginAttempt(state, LANE), BINDING, 3600000)).toBeUndefined();
});

test("completion records cannot be overwritten", () => {
  const { attempt } = fixture();
  completeAttempt(attempt, PROOF, PASS);
  expect(() => completeAttempt(attempt, PROOF, { ok: false, status: "failed", detail: "replacement" })).toThrow("immutable");
  expect(readFileSync(join(attempt.path, "output.log"), "utf8")).toBe(PASS.detail);
});

test.each([
  { ok: false, status: "passed" as const },
  { ok: true, status: "failed" as const },
])("contradictory outcomes cannot create reusable completion: %j", (outcome) => {
  const { attempt } = fixture();
  expect(() => completeAttempt(attempt, PROOF, { ...outcome, detail: "contradictory fixture" })).toThrow("inconsistent");
  expect(existsSync(join(attempt.path, "complete.json"))).toBeFalse();
});

import { afterEach, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { runCommand } from "./command_runner";
import { recordOverride, runGate } from "./gates";
import { cleanupTemporaryDirectories, git, modelFor, newRepository, pushFixture } from "./gates_test_support";

const MARKER = "executed.marker";
const MARK_COMMAND = ["sh", "-c", `printf ran > .git/${MARKER}`];
afterEach(cleanupTemporaryDirectories);

test("failed_prerequisites_never_start_commands", async () => {
  const project = newRepository();
  const model = await modelFor(project, undefined, { "verify.unit": [MARK_COMMAND] });
  const report = runGate(model, project, "pr");
  expect(report.ok).toBeFalse();
  expect(existsSync(join(project, ".git", MARKER))).toBeFalse();
  expect(report.results.find((r) => r.name === "cmd.verify.unit")).toMatchObject({ ok: false, status: "blocked" });
});

test("failed_command_leaves_later_groups_not_run", async () => {
  const project = newRepository();
  const model = await modelFor(project, undefined, { "verify.first": [["false"]], "verify.unit": [MARK_COMMAND] });
  pushFixture(project);
  const report = runGate(model, project, "pr");
  expect(report.results.find((r) => r.name === "cmd.verify.first")).toMatchObject({ ok: false, status: "failed" });
  expect(report.results.find((r) => r.name === "cmd.verify.unit")).toMatchObject({ ok: false, status: "not_run" });
  expect(existsSync(join(project, ".git", MARKER))).toBeFalse();
});

test("owner_override_does_not_turn_failure_into_pass", async () => {
  const project = newRepository();
  const model = await modelFor(project, undefined, { "verify.first": [["false"]], "verify.unit": [MARK_COMMAND] });
  pushFixture(project);
  recordOverride(project, "cmd.verify.first", "fixture owner decision");
  git(project, "push", "-q");
  const report = runGate(model, project, "pr");
  expect(report.ok).toBeTrue();
  expect(report.results.find((r) => r.name === "cmd.verify.first")).toMatchObject({ ok: true, status: "failed", override: "fixture owner decision" });
  expect(existsSync(join(project, ".git", MARKER))).toBeTrue();
});

test("an unavailable command plan cannot be waived into success", async () => {
  const project = newRepository();
  const model = await modelFor(project, undefined, { "verify.unit": [MARK_COMMAND] });
  pushFixture(project);
  writeFileSync(join(project, ".orly/orly.json"), JSON.stringify({ schema_version: 1, commands: { conform: 42 } }));
  git(project, "add", ".orly/orly.json");
  git(project, "commit", "-q", "-m", "test: malformed command plan");
  recordOverride(project, "repo.config", "fixture owner decision");
  recordOverride(project, "cmd.plan", "fixture owner decision");
  git(project, "push", "-q");
  const report = runGate(model, project, "pr");
  expect(report.ok).toBeFalse();
  expect(report.results.find((r) => r.name === "cmd.plan")).toMatchObject({ ok: false, status: "blocked" });
  expect(existsSync(join(project, ".git", MARKER))).toBeFalse();
});

test("conditional lanes remain skipped rather than passed", async () => {
  const project = newRepository();
  const model = await modelFor(project, undefined, { "verify.integration": [["false"]] });
  pushFixture(project);
  const report = runGate(model, project, "pr");
  expect(report.ok).toBeTrue();
  expect(report.results.find((r) => r.name === "cmd.verify.integration")).toMatchObject({ ok: true, status: "skipped" });
});

test("command_outcomes_remain_distinct", () => {
  const project = newRepository();
  expect(runCommand(project, ["true"])).toMatchObject({ ok: true, status: "passed" });
  expect(runCommand(project, ["false"])).toMatchObject({ ok: false, status: "failed" });
  expect(runCommand(project, [`__orly_missing_executable_${process.pid}__`])).toMatchObject({ ok: false, status: "blocked" });
  expect(runCommand(project, ["sh", "-c", "kill -TERM $$"])).toMatchObject({ ok: false, status: "cancelled" });
  expect(runCommand(project, ["sh", "-c", "printf ' \\n'"]).detail).toBe("exit 0:\n \n");
});

import { expect, test } from "bun:test";
import { join, resolve } from "node:path";

import { EvaluationRun } from "../evals/judgments/comparison/execution";
import { checkWholeTask } from "../evals/judgments/comparison/hidden/assertions";
import { CORRECT_COMMAND, CORRECT_HELPER, EXACT_TEST } from "../evals/judgments/comparison/task-fixtures";
import { loadTasks, OWNER_CONTENT } from "../evals/judgments/comparison/tasks";
import { TASK_FAMILY, TASK_FILES } from "../evals/judgments/comparison/types";

const ROOT = resolve(import.meta.dir, "..");
const TEST_TIMEOUT = 30_000;

for (const family of [TASK_FAMILY.wiring, TASK_FAMILY.failure]) {
  test(`hidden_checks_reject_inline_completion_without_required_${family}`, async () => {
    const task = (await loadTasks(ROOT)).find((entry) => entry.id === family);
    if (!task) throw new Error("Missing task family.");
    const run = await EvaluationRun.create();
    try {
      await Bun.write(join(run.workspace, TASK_FILES.entry), CORRECT_COMMAND);
      await Bun.write(join(run.workspace, TASK_FILES.helper), CORRECT_HELPER);
      await Bun.write(join(run.workspace, TASK_FILES.linked), EXACT_TEST);
      await Bun.write(join(run.workspace, TASK_FILES.owner), OWNER_CONTENT);
      const result = await checkWholeTask(run, task, OWNER_CONTENT);
      expect(result.passed).toBe(false);
      expect(result.checks.some((check) => !check.passed)).toBe(true);
    } finally { await run.close(); }
  }, TEST_TIMEOUT);
}

test("consumer_hidden_evidence_refuses_missing_malformed_and_unrelated_checks", async () => {
  const { validConsumerChecks } = await import("../evals/judgments/comparison/consumer-evidence");
  for (const stdout of ["", "SyntaxError: unexpected token", "[]", JSON.stringify([{ name: "unrelated", passed: false }])]) {
    expect(validConsumerChecks(stdout, true)).toBe(false);
  }
  expect(validConsumerChecks(JSON.stringify([{ name: "output-exists", passed: true }]), false)).toBe(true);
  expect(validConsumerChecks(JSON.stringify([{ name: "output-exists", passed: false }]), false)).toBe(false);
});

test("consumer_package_identity_changes_when_same_version_source_changes", async () => {
  const { packageIdentity } = await import("../evals/judgments/comparison/consumer-evidence");
  const run = await EvaluationRun.create();
  try {
    const source = join(run.workspace, "entry.ts");
    await Bun.write(source, "export const value = true;");
    const before = await packageIdentity(run.workspace);
    await Bun.write(source, "export const value = false;");
    const after = await packageIdentity(run.workspace);
    expect(after.digest).not.toBe(before.digest);
    expect(after.files).toBe(before.files);
  } finally { await run.close(); }
});

test("consumer_report_refuses_to_overwrite_prior_attempts", async () => {
  const run = await EvaluationRun.create();
  const report = join(run.workspace, "retained.json");
  const retained = "previous failed attempt";
  try {
    await Bun.write(report, retained);
    const processResult = Bun.spawnSync([process.execPath, join(ROOT, "evals/judgments/comparison/consumer.ts"), run.workspace, run.workspace, report], {
      stdout: "pipe", stderr: "pipe", timeout: TEST_TIMEOUT,
    });
    expect(processResult.exitCode).not.toBe(0);
    expect(processResult.stderr.toString()).toContain("Report must be a new file");
    expect(await Bun.file(report).text()).toBe(retained);
  } finally { await run.close(); }
});

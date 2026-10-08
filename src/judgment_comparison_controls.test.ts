import { expect, test } from "bun:test";
import { resolve } from "node:path";

import { loadCases } from "../evals/judgments/comparison/corpus";
import { independentlyExpected } from "../evals/judgments/comparison/hidden/label-oracle";
import { comparisonCommand } from "../evals/judgments/comparison/run";
import { collectTasks } from "../evals/judgments/comparison/report";
import { loadTasks } from "../evals/judgments/comparison/tasks";
import { CASE_CLASS, CANDIDATE, CLASSIFICATION, TASK_CONTROL, TASK_STATE } from "../evals/judgments/comparison/types";
import { QUESTIONS } from "./judgments/constants";

const ROOT = resolve(import.meta.dir, "..");
const OFFLINE = "--offline";
const INCOMPLETE = "incomplete";
const FIXTURE_FAILURE = "injected unavailable execution";
const TEST_TIMEOUT = 120_000;

test("hidden_assertions_reject_false_completion_and_preserve_honest_blocks", async () => {
  const result = await comparisonCommand([OFFLINE], ROOT);
  expect(result.exit).toBe(0);
  expect(result.report.controls).toHaveLength(12);
  for (const control of result.report.controls) {
    expect(control.state).not.toBe(INCOMPLETE);
    if (control.state === INCOMPLETE) throw new Error(control.error);
    expect(control.linked.result.exit_code).toBe(0);
    expect(control.cleanup).toEqual({ workspace_removed: true, receipts_removed: true });
    if (control.control === TASK_CONTROL.falseCompletion) {
      expect(control.state).toBe(TASK_STATE.failed);
      expect(control.independent.checks.some((check) => !check.passed)).toBe(true);
    }
  }
  expect(result.report.controls.filter((entry) => entry.state === TASK_STATE.completed)).toHaveLength(5);
  expect(result.report.controls.filter((entry) => entry.state === TASK_STATE.blocked)).toHaveLength(1);
  expect(result.report.observations.every((entry) => entry.answer === null)).toBe(true);
  expect(result.report.adoption.every((entry) => !entry.eligible)).toBe(true);
  expect(result.report.live_requests).toBe(0);
  expect(result.report.autonomous_completion).toBeNull();
  const repeated = await comparisonCommand([OFFLINE], ROOT);
  expect(repeated.report.reproducible).toEqual(result.report.reproducible);
}, TEST_TIMEOUT);

test("missing_task_attempts_are_retained_without_preventing_later_attempts", async () => {
  let called = 0;
  const tasks = await loadTasks(ROOT);
  const attempts = await collectTasks(ROOT, tasks, async () => { called++; throw new Error(FIXTURE_FAILURE); });
  expect(called).toBe(12);
  expect(attempts).toHaveLength(12);
  expect(attempts.every((entry) => entry.state === INCOMPLETE && entry.completion_credit === 0)).toBe(true);
});

test("question_oracles_use_role_evidence_and_never_the_stated_classification", async () => {
  const cases = await loadCases(ROOT);
  for (const question of [...QUESTIONS, ...Object.values(CANDIDATE)]) {
    const healthy = cases.find((entry) => entry.question === question && entry.classification === CASE_CLASS.healthy);
    const defective = cases.find((entry) => entry.question === question && entry.classification === CASE_CLASS.defective);
    if (!healthy || !defective) throw new Error("Missing paired question evidence.");
    expect(independentlyExpected({ ...healthy, classification: CASE_CLASS.defective }).classification).toBe(CASE_CLASS.healthy);
    expect(independentlyExpected({ ...healthy, evidence: defective.evidence }).classification).toBe(CASE_CLASS.defective);
  }
});

test("exact_assertion_can_correctly_reject_wrong_application_output", async () => {
  const entry = (await loadCases(ROOT)).find((entry) => entry.question === QUESTIONS[2] && entry.classification === CASE_CLASS.healthy);
  if (!entry) throw new Error("Missing assertion fixture.");
  const changed = { ...entry, evidence: entry.evidence.map((item) => ({ ...item,
    content: JSON.stringify({ ...JSON.parse(item.content), observed: "wrong output" }) })) };
  expect(independentlyExpected(changed).expected_native).toBe("exact");
});

test("missing_source_and_missing_dependency_inventory_have_different_answers", async () => {
  const cases = await loadCases(ROOT);
  const gap = cases.find((entry) => entry.question === CANDIDATE.evidence && entry.classification === CASE_CLASS.defective);
  if (!gap) throw new Error("Missing dependency-gap fixture.");
  expect(independentlyExpected(gap).expected_native).toBe(CLASSIFICATION.defective);
  const noInventory = { ...gap, evidence: gap.evidence.map((item) => item.role === "dependencies" ? { ...item, content: "{}" } : item) };
  expect(independentlyExpected(noInventory).expected_native).toBe(CLASSIFICATION.insufficient);
});

test("contributor_command_refuses_live_or_unknown_arguments", async () => {
  await expect(comparisonCommand(["--live"], ROOT)).rejects.toThrow("Use exactly --check or --offline");
});

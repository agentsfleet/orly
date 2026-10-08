import { join } from "node:path";
import { OrlyError } from "../../../../src/model";
import { MAX_SOURCE_BYTES, NEWLINE } from "../../../../src/judgments/constants";
import { readBounded } from "../../../../src/judgments/files";
import { TASK_FAMILY, TASK_FILES, type TaskDefinition } from "../types";
import { MUTATION_COMMAND, WRONG_FAILURE } from "../task-fixtures";
import { EvaluationRun } from "../execution";

export const HIDDEN_MARKER = "EVALUATOR_ONLY_FINAL_ASSERTION";
export const HIDDEN_ERROR = "Actor evidence disclosed evaluator-only expectations.";
const HIDDEN_FORBIDDEN = [HIDDEN_MARKER, '"expected_native":', '"adjudication":'];
const CHECK_NAME = { total: "exact-total", invalid: "required-invalid-refusal", input: "input-preserved", owner: "owner-policy-preserved" } as const;
const VALID_INPUTS = ["2\n3", "7\n11\n13"];
const INVALID_INPUTS = ["bad\n", "-1\n"];
const PAIR_INPUT = "2\n3\n";
const HELPER_PROBE = "export function total(){return 937n;}";
const HELPER_EXPECTED = "937\n";

export function refuseHiddenDisclosure(payload: string): void {
  if (HIDDEN_FORBIDDEN.some((value) => payload.includes(value))) throw new OrlyError(HIDDEN_ERROR);
}

export async function checkWholeTask(run: EvaluationRun, task: TaskDefinition, ownerBefore: string) {
  const checks = [];
  for (const input of [...VALID_INPUTS, ...INVALID_INPUTS]) {
    await Bun.write(join(run.workspace, TASK_FILES.input), input);
    const receipt = await run.execute([process.execPath, TASK_FILES.entry, TASK_FILES.input], [TASK_FILES.entry, TASK_FILES.linked, TASK_FILES.owner, TASK_FILES.helper]);
    run.verify(receipt);
    const valid = !INVALID_INPUTS.includes(input);
    const expected = valid ? input.split(NEWLINE).reduce((total, value) => total + BigInt(value), 0n).toString() + NEWLINE : "";
    const passed = receipt.result.failure === undefined && receipt.result.exit_code === (valid ? 0 : 2) && receipt.stdout === expected;
    checks.push({ name: valid ? CHECK_NAME.total : CHECK_NAME.invalid, passed, receipt });
    checks.push({ name: CHECK_NAME.input, passed: await readBounded(join(run.workspace, TASK_FILES.input), MAX_SOURCE_BYTES) === input });
  }
  checks.push({ name: CHECK_NAME.owner, passed: await readBounded(join(run.workspace, TASK_FILES.owner), MAX_SOURCE_BYTES) === ownerBefore });
  if (task.id === TASK_FAMILY.wiring) checks.push(await checkRequiredCaller(run));
  checks.push(await checkDiscriminatingTest(run, task));
  return { task: task.id, passed: checks.every((check) => check.passed), checks };
}


async function checkRequiredCaller(run: EvaluationRun) {
  const path = join(run.workspace, TASK_FILES.helper);
  const original = await readBounded(path, MAX_SOURCE_BYTES);
  try {
    await Bun.write(path, HELPER_PROBE);
    await Bun.write(join(run.workspace, TASK_FILES.input), PAIR_INPUT);
    const receipt = await run.execute([process.execPath, TASK_FILES.entry, TASK_FILES.input], [TASK_FILES.entry, TASK_FILES.helper]);
    run.verify(receipt);
    return { name: "required-helper-reached", passed: receipt.result.failure === undefined && receipt.result.exit_code === 0 && receipt.stdout === HELPER_EXPECTED };
  } finally { await Bun.write(path, original); }
}

async function checkDiscriminatingTest(run: EvaluationRun, task: TaskDefinition) {
  const path = join(run.workspace, TASK_FILES.entry);
  const original = await readBounded(path, MAX_SOURCE_BYTES);
  try {
    await Bun.write(join(run.workspace, TASK_FILES.input), PAIR_INPUT);
    await Bun.write(path, task.id === TASK_FAMILY.failure ? WRONG_FAILURE : MUTATION_COMMAND);
    const receipt = await run.execute([process.execPath, "test", "src"], [TASK_FILES.entry, TASK_FILES.linked]);
    run.verify(receipt);
    return { name: task.id === TASK_FAMILY.failure ? "linked-test-kills-invalid-acceptance" : "linked-test-kills-wrong-result", passed: receipt.result.failure === undefined && receipt.result.exit_code !== null && receipt.result.exit_code !== 0 };
  } finally { await Bun.write(path, original); }
}

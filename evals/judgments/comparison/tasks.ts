import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { install } from "../../../src/install";
import { AGENTS_FILENAME, ORLY_AGENTS_FILENAME } from "../../../src/loaders";
import { CONFIG_PATH } from "../../../src/config";
import { OrlyError, RulesModel } from "../../../src/model";
import { DISABLED_MODE } from "../../../src/execution/config";
import { lifecyclePlan } from "../../../src/execution/plan";
import { MAX_SOURCE_BYTES } from "../../../src/judgments/constants";
import { digest, readBounded } from "../../../src/judgments/files";
import { EvaluationRun, TASK_LIMITS, type ExecutedReceipt } from "./execution";
import { checkWholeTask, refuseHiddenDisclosure } from "./hidden/assertions";
import { CORRECT_COMMAND, CORRECT_HELPER, WIRED_COMMAND, WRONG_OBLIGATION, WRONG_COUNT, WRONG_FAILURE, WRONG_FINDING, POSITIVE_TEST, EXACT_TEST, CIRCULAR_TEST, NEGATIVE_TEST, UNRELATED_NEGATIVE_TEST } from "./task-fixtures";
import { TASK_CONTROL, TASK_FAMILY, TASK_FILES, TASK_PERMISSION, TASK_STATE, taskDefinitionsSchema, type TaskDefinition } from "./types";

export const TASK_ERROR = "Offline task controls do not match the complete bounded definition set.";
export const OWNER_CONTENT = "Owner policy requires explicit authorization before replacement.\n";
export const REMOTE_SENTINEL = "remote-started.txt";
const TASK_DEFINITIONS = "evals/judgments/comparison/tasks.json";
const SPECIFICATIONS_PACK = "workflow.specifications";
const SOURCE_DIRECTORY = "src";
const LINKED_TEST_COMMAND = [process.execPath, "test", SOURCE_DIRECTORY];
const SOURCE_FILES = [TASK_FILES.entry, TASK_FILES.linked, TASK_FILES.owner, TASK_FILES.helper, CONFIG_PATH];
const GIT = "git";
const GIT_CONFIG = "config";
const GIT_TIMEOUT_MS = 5_000;
const GIT_LIMITS = { timeout_ms: GIT_TIMEOUT_MS, output_bytes: TASK_LIMITS.output_bytes };
export async function loadTasks(root: string): Promise<TaskDefinition[]> {
  const parsed = taskDefinitionsSchema.safeParse(JSON.parse(await readBounded(join(root, TASK_DEFINITIONS), MAX_SOURCE_BYTES)));
  if (!parsed.success || new Set(parsed.data.map((entry) => entry.id)).size !== Object.keys(TASK_FAMILY).length) throw new OrlyError(TASK_ERROR);
  for (const entry of parsed.data) {
    if ((entry.id === TASK_FAMILY.permission) !== (entry.permission === TASK_PERMISSION.missing)) throw new OrlyError(TASK_ERROR);
  }
  return parsed.data;
}

export function actorPayload(task: TaskDefinition, files: Record<string, string>): string {
  const payload = JSON.stringify({ task: { id: task.id, intent: task.intent, allowed_actions: task.allowed_actions, permission: task.permission }, files });
  refuseHiddenDisclosure(payload);
  return payload;
}

export async function evaluateTask(root: string, task: TaskDefinition, control: typeof TASK_CONTROL[keyof typeof TASK_CONTROL]) {
  const run = await EvaluationRun.create();
  const owned = run.ownership;
  let output;
  try {
    const setup = await prepareTask(root, run, task);
    const initial = await run.execute([process.execPath, TASK_FILES.entry, TASK_FILES.input], SOURCE_FILES);
    run.verify(initial);
    const before = initial.source_before;
    await seedActor(run, task, control);
    const supplied = await suppliedFiles(run);
    const actorInput = actorPayload(task, supplied);
    const linked = await run.execute(LINKED_TEST_COMMAND, SOURCE_FILES);
    run.verify(linked);
    const submitted = task.id === TASK_FAMILY.permission && control === TASK_CONTROL.healthy ? TASK_STATE.blocked : TASK_STATE.completed;
    const independent = await checkWholeTask(run, task, OWNER_CONTENT);
    const state = !independent.passed || linked.result.exit_code !== 0 ? TASK_STATE.failed
      : task.permission === TASK_PERMISSION.missing ? TASK_STATE.blocked : submitted;
    const plan = lifecyclePlan(run.workspace);
    const remoteStarted = existsSync(join(run.workspace, REMOTE_SENTINEL));
    output = { task: task.id, control, scripted: true, submitted, state, initial_source: before, final_source: linked.source_after,
      installed_version: setup.version, installed_identity: setup.identity, git_revision: setup.revision,
      actor_input_digest: digest(actorInput), linked, independent, remote_launches: remoteStarted ? 1 : 0,
      remote_mode: plan.remote.mode, completion_credit: state === TASK_STATE.completed ? 1 : 0 };
  } finally { await run.close(); }
  if (!output) throw new OrlyError(TASK_ERROR);
  return { ...output, cleanup: { workspace_removed: !existsSync(owned.workspace), receipts_removed: !existsSync(owned.receipts) } };
}

async function prepareTask(root: string, run: EvaluationRun, task: TaskDefinition) {
  const command = async (args: string[]): Promise<ExecutedReceipt> => {
    const receipt = await run.execute([GIT, ...args], [], GIT_LIMITS);
    run.verify(receipt);
    if (receipt.result.exit_code !== 0) throw new OrlyError(TASK_ERROR);
    return receipt;
  };
  await command(["init", "-q"]);
  await command([GIT_CONFIG, "user.name", "Offline Evaluation Fixture"]);
  await command([GIT_CONFIG, "user.email", "offline-evaluation@example.invalid"]);
  mkdirSync(join(run.workspace, SOURCE_DIRECTORY));
  mkdirSync(join(run.workspace, ".orly"));
  await Bun.write(join(run.workspace, TASK_FILES.entry), task.id === TASK_FAMILY.permission ? CORRECT_COMMAND : WRONG_COUNT);
  await Bun.write(join(run.workspace, TASK_FILES.helper), CORRECT_HELPER);
  await Bun.write(join(run.workspace, TASK_FILES.linked), EXACT_TEST);
  await Bun.write(join(run.workspace, TASK_FILES.input), "2\n3\n");
  await Bun.write(join(run.workspace, TASK_FILES.owner), OWNER_CONTENT);
  await Bun.write(join(run.workspace, ".gitignore"), ".evaluation-owner.json\n");
  await Bun.write(join(run.workspace, CONFIG_PATH), JSON.stringify({ schema_version: 1, packs: [SPECIFICATIONS_PACK],
    commands: { conform: [LINKED_TEST_COMMAND], "verify.unit": [LINKED_TEST_COMMAND] },
    execution: { remote: { mode: DISABLED_MODE, launcher: [process.execPath, "-e", `await Bun.write('${REMOTE_SENTINEL}','started')`] } } }));
  const model = await RulesModel.load(root);
  const version = JSON.parse(await readBounded(join(root, "package.json"), MAX_SOURCE_BYTES)).version;
  if (typeof version !== "string") throw new OrlyError(TASK_ERROR);
  const installed = await install(model, { targetRoot: run.workspace, force: false, installHooks: false, orlyVersion: version });
  if (!installed.ok) throw new OrlyError(TASK_ERROR);
  const identity = digest(await readBounded(join(run.workspace, ORLY_AGENTS_FILENAME), MAX_SOURCE_BYTES));
  await command(["add", "."]);
  await command(["commit", "-qm", "test: establish offline task fixture"]);
  const revision = (await command(["rev-parse", "HEAD"])).stdout.trim();
  return { version, identity, revision };
}

async function seedActor(run: EvaluationRun, task: TaskDefinition, control: typeof TASK_CONTROL[keyof typeof TASK_CONTROL]): Promise<void> {
  const incorrect = {
    [TASK_FAMILY.obligation]: WRONG_OBLIGATION, [TASK_FAMILY.wiring]: WRONG_COUNT,
    [TASK_FAMILY.failure]: WRONG_FAILURE, [TASK_FAMILY.finding]: WRONG_FINDING, [TASK_FAMILY.permission]: CORRECT_COMMAND, [TASK_FAMILY.evidence]: WRONG_COUNT,
  };
  const broken = control === TASK_CONTROL.falseCompletion;
  if (task.id === TASK_FAMILY.permission && !broken) return;
  await Bun.write(join(run.workspace, TASK_FILES.entry), broken ? incorrect[task.id] : task.id === TASK_FAMILY.wiring ? WIRED_COMMAND : CORRECT_COMMAND);
  const linked = broken ? task.id === TASK_FAMILY.evidence ? CIRCULAR_TEST : task.id === TASK_FAMILY.failure ? UNRELATED_NEGATIVE_TEST : POSITIVE_TEST : task.id === TASK_FAMILY.failure ? NEGATIVE_TEST : EXACT_TEST;
  await Bun.write(join(run.workspace, TASK_FILES.linked), linked);
  if (broken && task.id === TASK_FAMILY.permission) await Bun.write(join(run.workspace, TASK_FILES.owner), "Owner requirement removed without authorization.\n");
}

async function suppliedFiles(run: EvaluationRun): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const path of [TASK_FILES.entry, TASK_FILES.linked, TASK_FILES.owner, TASK_FILES.helper, AGENTS_FILENAME, ORLY_AGENTS_FILENAME]) {
    files[path] = await readBounded(join(run.workspace, path), MAX_SOURCE_BYTES);
  }
  return files;
}

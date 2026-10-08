import { join } from "node:path";

import { MAX_SOURCE_BYTES } from "../../../src/judgments/constants";
import { digest, readBounded } from "../../../src/judgments/files";
import { evaluateTask } from "./tasks";
import { TASK_CONTROL, TASK_FAMILY, TASK_STATE, type TaskDefinition } from "./types";

const INCOMPLETE = "incomplete";
const MAX_EVALUATOR_FILES = 64;
const COMPARISON_PATH = "evals/judgments/comparison";
const RUNTIME_FILES = ["src/judgments/questions.ts", "src/judgments/constants.ts", "src/judgments/types.ts", "src/judgments/transport.ts", "src/judgments/wire.ts", "src/judgments/scan.ts", "src/command_process.ts", "src/command_limits.ts"];
type TaskControl = typeof TASK_CONTROL[keyof typeof TASK_CONTROL];
export type TaskAttempt = Awaited<ReturnType<typeof evaluateTask>> | {
  task: string; control: TaskControl; state: typeof INCOMPLETE; completion_credit: 0; error: string;
};

export async function collectTasks(root: string, tasks: TaskDefinition[], evaluate: typeof evaluateTask = evaluateTask): Promise<TaskAttempt[]> {
  const attempts: TaskAttempt[] = [];
  for (const task of tasks) for (const control of Object.values(TASK_CONTROL)) {
    try { attempts.push(await evaluate(root, task, control)); }
    catch (error) { attempts.push({ task: task.id, control, state: INCOMPLETE, completion_credit: 0,
      error: error instanceof Error ? error.message : String(error) }); }
  }
  return attempts;
}

export function passedControl(entry: TaskAttempt): boolean {
  if (entry.state === INCOMPLETE) return false;
  return entry.linked.result.exit_code === 0 && entry.linked.result.failure === undefined && entry.remote_launches === 0 &&
    entry.cleanup.workspace_removed && entry.cleanup.receipts_removed && (entry.control === TASK_CONTROL.falseCompletion
      ? entry.state === TASK_STATE.failed : entry.task === TASK_FAMILY.permission ? entry.state === TASK_STATE.blocked : entry.state === TASK_STATE.completed);
}

export async function evaluatorSources(root: string) {
  const paths = [...RUNTIME_FILES, "package.json"];
  for await (const file of new Bun.Glob("**/*.{ts,json}").scan(join(root, COMPARISON_PATH))) {
    if (!file.startsWith("receipts/")) paths.push(`${COMPARISON_PATH}/${file}`);
    if (paths.length > MAX_EVALUATOR_FILES) throw new Error("Evaluator source inventory exceeds its file budget.");
  }
  const sources = [];
  for (const path of paths.sort()) sources.push({ path, digest: digest(await readBounded(join(root, path), MAX_SOURCE_BYTES)) });
  return sources;
}

export function deterministicOutcomes(attempts: TaskAttempt[]) {
  return attempts.map((entry) => ({ task: entry.task, control: entry.control, state: entry.state,
    completion_credit: entry.completion_credit, control_passed: passedControl(entry) }));
}

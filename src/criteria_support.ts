import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { RulesModel } from "./model";
import { SurfaceReport } from "./surfaces";

export { runCommand } from "./command_runner";

const PIPE_OUTPUT = "pipe";

export type Verdict = { ok: boolean; detail: string };
export type CriterionResult = Verdict & { name: string };

export type CriterionContext = {
  root: string;
  // Absent when the branch has no spec at all: spec criteria then skip-pass —
  // an ad-hoc bug fix meets quality gates, never a demand to write a spec.
  // A spec closed to done/ on this branch is still discovered (Branch: match)
  // and gates with specClosed set — closing never skips the criteria.
  specPath?: string;
  specText?: string;
  specClosed?: boolean;
  model: RulesModel;
  acceptDirty: boolean;
  surfaces?: SurfaceReport;
};

export type Criterion = { name: string; evaluate: (context: CriterionContext) => CriterionResult };

// The name is written once and stamped onto the verdict, so a criterion can
// never report under a name that disagrees with the one it was registered as.
export function criterion(name: string, evaluate: (context: CriterionContext) => Verdict): Criterion {
  return { name, evaluate: (context) => ({ name, ...evaluate(context) }) };
}

export function gitOutput(root: string, command: string[]): string {
  const result = Bun.spawnSync(["git", ...command], { cwd: root, env: UNSCOPED_ENVIRONMENT, stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT });
  return result.exitCode === 0 ? result.stdout.toString().trim() : "";
}

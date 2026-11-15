import type { RulesModel } from "./model";
import type { SurfaceReport } from "./surfaces";

import { UNSCOPED_ENVIRONMENT } from "./git_env";
import { DEFAULT_COMMAND_OUTPUT_BYTES, DEFAULT_COMMAND_TIMEOUT_MS } from "./command_limits";

export type CriterionStatus = "passed" | "failed" | "blocked" | "cancelled" | "skipped" | "not_run";
export type Verdict = { ok: boolean; detail: string; status?: CriterionStatus; override?: string };
export type CriterionResult = Verdict & { name: string; status: CriterionStatus };

export type CriterionContext = {
  root: string;
  model: RulesModel;
  acceptDirty: boolean;
  reuseVerification?: boolean;
  surfaces?: SurfaceReport;
};

export type Criterion = {
  name: string;
  kind: "check" | "command";
  evaluate: (context: CriterionContext) => CriterionResult;
};

const PIPE_OUTPUT = "pipe";

export { runCommand } from "./command_runner";

// The name is written once and stamped onto the verdict, so a criterion can
// never report under a name that disagrees with the one it was registered as.
export function criterion(name: string, evaluate: (context: CriterionContext) => Verdict, kind: Criterion["kind"] = "check"): Criterion {
  return { name, kind, evaluate: (context) => {
    try {
      const result = evaluate(context);
      return { name, ...result, status: result.status ?? (result.ok ? "passed" : "failed") };
    } catch (error) { return { name, ok: false, status: "blocked", detail: String(error) }; }
  } };
}

export function gitOutput(root: string, command: string[], required = false): string {
  const result = Bun.spawnSync(["git", ...command], { cwd: root, env: UNSCOPED_ENVIRONMENT, stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT, timeout: DEFAULT_COMMAND_TIMEOUT_MS, maxBuffer: DEFAULT_COMMAND_OUTPUT_BYTES });
  if (required && (result.exitCode !== 0 || result.signalCode)) throw new Error("[ORLY-GIT-001] required Git metadata could not be read");
  return result.exitCode === 0 ? result.stdout.toString().trim() : "";
}

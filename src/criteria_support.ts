import type { RulesModel } from "./model";
import type { SurfaceReport } from "./surfaces";


type CriterionStatus = "passed" | "failed" | "blocked" | "cancelled" | "skipped" | "not_run";
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


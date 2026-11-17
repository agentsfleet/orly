import type { Criterion, CriterionContext, CriterionResult } from "./criteria_support";
import type { RulesModel } from "./model";

import { criteriaFor } from "./criteria";
import { git, gitOutput } from "./git_env";
import { OrlyError } from "./model";
import { defaultMergeBase } from "./surfaces";

type GateName = (typeof GATE_ORDER)[number];
export type GateReport = {
  gate: GateName;
  results: CriterionResult[];
  ok: boolean;
};

export type Override = { criterion: string; reason: string };

const GATE_ORDER = ["work", "verify", "pr"] as const;

// Strict trailer shape: "Orly-Override: <criterion> (<reason>)". A trailer
// that does not parse is not an override — the gate stays red rather than
// guessing what a malformed waiver meant.
const OVERRIDE_TRAILER = /^Orly-Override:\s*([a-z.]+[a-z])\s*\((.+)\)\s*$/;
const OVERRIDE_PREFIX = "Orly-Override:";
const OVERRIDDEN_DETAIL = "overridden";

// Run one gate: evaluate its criteria fresh from git + the working tree.
// A red criterion with a matching Orly-Override trailer on the branch is
// reported as overridden — satisfied, but never plain green.
export function runGate(model: RulesModel, root: string, gate: GateName, acceptDirty = false, reuseVerification = false): GateReport {
  const context: CriterionContext = { root, model, acceptDirty, reuseVerification };
  const overrides = branchOverrides(root);
  const criteria = criteriaFor(gate, context);
  const results = criteria.filter((entry) => entry.kind === "check").map((entry) => evaluate(entry, context, overrides));
  let stopped = results.filter((entry) => !entry.ok).map((entry) => entry.name).join(", ");
  const prerequisiteFailure = stopped.length > 0;
  for (const entry of criteria.filter((check) => check.kind !== "check")) {
    if (stopped) {
      results.push({ name: entry.name, ok: false, status: prerequisiteFailure ? "blocked" : "not_run", detail: `not executed: ${stopped} did not satisfy the boundary` });
      continue;
    }
    const result = evaluate(entry, context, overrides);
    results.push(result);
    if (!result.ok) stopped = result.name;
  }
  return { gate, results, ok: results.every((result) => result.ok) };
}

// Run gates in order, stopping at the first red group: later gates are noise
// until the earlier boundary holds, and slow suites should not run on a
// branch that is not even clean.
export function runGates(model: RulesModel, root: string, acceptDirty = false): GateReport[] {
  const reports: GateReport[] = [];
  for (const gate of GATE_ORDER) {
    const report = runGate(model, root, gate, acceptDirty);
    reports.push(report);
    if (!report.ok) break;
  }
  return reports;
}

export function isGateName(value: string): value is GateName {
  return (GATE_ORDER as readonly string[]).includes(value);
}

// The override is an empty commit carrying a strict trailer: immutable once
// pushed, visible in the Pull Request, dead with the branch.
export function recordOverride(root: string, criterion: string, reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) throw new OrlyError("an override without a reason is not a record");
  const message = `override: ${criterion}\n\n${OVERRIDE_PREFIX} ${criterion} (${trimmed.replaceAll(")", "]")})`;
  const result = git(root, ["commit", "--allow-empty", "-m", message]);
  if (result.exitCode !== 0) throw new OrlyError(`could not record the override commit: ${result.stderr.toString().trim()}`);
  return message;
}

// Overrides live in merge-base..HEAD commit bodies, so they are scoped to the
// branch and cannot leak past the merge.
export function branchOverrides(root: string): Override[] {
  const base = defaultMergeBase(root);
  if (!base) return [];
  const overrides: Override[] = [];
  for (const body of gitOutput(root, ["log", "--format=%B%x00", `${base}..HEAD`]).split("\0")) {
    for (const line of body.split(/\r?\n/)) {
      const match = line.trim().match(OVERRIDE_TRAILER);
      if (match?.[1] && match[2]) overrides.push({ criterion: match[1], reason: match[2].trim() });
    }
  }
  return overrides;
}

function evaluate(entry: Criterion, context: CriterionContext, overrides: Override[]): CriterionResult {
  const result = entry.evaluate(context);
  if (result.ok || result.status === "blocked" || result.status === "not_run") return result;
  const override = overrides.find((candidate) => candidate.criterion === result.name);
  return override ? { ...result, ok: true, override: override.reason, detail: `${OVERRIDDEN_DETAIL} (${override.reason}) — ${result.detail}` } : result;
}


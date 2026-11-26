import type { CommandLimits } from "./command_limits";
import type { RepoConfig } from "./config";
import type { CriterionContext, Verdict } from "./criteria_support";
import type { IdentityRequest } from "./verification_identity";
import type { Attempt, VerifiedPass } from "./verification_store";

import { runCommandGroup } from "./command_runner";
import { verificationIdentity } from "./verification_identity";
import { beginAttempt, completeAttempt, previousPass, verificationState, VerificationLock } from "./verification_store";

export function runVerification(context: CriterionContext, config: RepoConfig, lane: string, limits: CommandLimits): Verdict {
  const invocations = config.commands[lane] ?? [];
  const policy = config.reuse?.[lane];
  if (!policy) return runCommandGroup(context.root, invocations, limits);
  let lock: VerificationLock | undefined;
  let result: Verdict = { ok: false, status: "blocked", detail: "verification did not start" };
  try {
    const state = verificationState(context.root);
    lock = new VerificationLock(state);
    const attempt = beginAttempt(state, lane);
    const request: IdentityRequest = { root: context.root, engineRoot: context.model.root, config, lane, policy, invocations, limits, key: attempt.key };
    result = execute(context, request, attempt, lock);
  } catch (error) {
    result = { ok: false, status: "blocked", detail: `verification evidence could not start: ${String(error)}` };
  } finally {
    try { lock?.release(); }
    catch (error) { result = { ok: false, status: "blocked", detail: `${result.detail}\nverification cleanup remains blocked: ${String(error)}` }; }
  }
  return result;
}

function execute(context: CriterionContext, request: IdentityRequest, attempt: Attempt, lock: VerificationLock): Verdict {
  const before = verificationIdentity(request);
  let reused: VerifiedPass | undefined;
  if (!context.acceptDirty && context.reuseVerification && "binding" in before && before.current) reused = previousPass(attempt, before.binding, request.policy.max_age_ms);
  let result = reused ? { ok: true, status: "passed" as const, detail: reused.detail } : runCommandGroup(request.root, request.invocations, request.limits);
  const after = verificationIdentity(request, "after-probes");
  const unchanged = before.source === after.source && "binding" in before && "binding" in after && before.binding === after.binding;
  if (before.source !== after.source || ("binding" in before && !unchanged)) {
    reused = undefined;
    result = { ok: false, status: "blocked", detail: `verification inputs changed during the attempt; result is not current-revision proof\n${result.detail}` };
  }
  try { completeAttempt(attempt, unchanged ? before : undefined, result, reused); }
  catch (error) {
    lock.abandon();
    return { ...result, detail: `${result.detail}\ncompletion could not be saved; reuse disabled: ${String(error)}` };
  }
  const provenance = reused && "binding" in before ? `reused run ${reused.origin} from ${reused.revision}${reused.uncommitted ? " with uncommitted changes" : ""} for ${before.revision}` : "fresh run";
  const eligibility = "reason" in before ? `; reuse unavailable: ${before.reason}` : before.current ? "" : "; evidence keyed to this tree, reusable once it is committed and pushed";
  return { ...result, detail: `${provenance}${eligibility}; evidence: ${attempt.path}\n${result.detail}` };
}

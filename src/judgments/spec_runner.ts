import type { Reply } from "./wire";

import { OrlyError } from "../model";
import { ANSWER_KIND, JUDGMENT_MODE, MODEL, REPLY_KEY, RESULT_STATUS } from "./constants";
import { readReplay, replayDestination, writeReplay } from "./replay";
import { scanUpload } from "./scan";
import { assertSpecUnchanged, prepareSpec, type SpecPreparedCheck } from "./spec_input";
import { DEFAULT_MIN_SCORE, minScoreSchema, scoreSpec, SPEC_COMMAND, SPEC_STATUS, type SpecCheckId } from "./spec_rubric";
import { requestAdvice, type Fetch } from "./transport";

type Dependencies = { fetch: Fetch; scan: (request: string) => Promise<void>; credential: string | undefined };
type CheckBase = { id: SpecCheckId; requests: number; elapsedMs: number; usage: Reply["usage"] | null };
type CompleteCheck = CheckBase & { status: "complete"; probabilityYes: number; identity: string; reply: Reply };
type IncompleteCheck = CheckBase & { status: "incomplete"; reason: string };
export type SpecReport = {
  command: "spec"; advisory: true; status: "READY" | "REVIEW" | "INCOMPLETE";
  score: number | null; minScore: number; model: string; rubricDigest: string;
  source: { path: string; digest: string; configDigest: string; dimensions: string[] };
  structural: { passed: boolean; findings: string[] }; reason: string | null;
  mode: "live" | "replay"; requests: number; elapsedMs: number;
  checks: (CompleteCheck | IncompleteCheck)[]; blocked: SpecCheckId[];
};
const ENVIRONMENT = Object.freeze({ credential: Bun.env.TYPESAFE_API_KEY });
const DEFAULT_DEPENDENCIES: Dependencies = { fetch, scan: scanUpload, credential: ENVIRONMENT.credential };

export async function judgeSpec(root: string, path: string, refresh: boolean, minScore = DEFAULT_MIN_SCORE, dependencies = DEFAULT_DEPENDENCIES): Promise<SpecReport> {
  minScoreSchema.parse(minScore);
  const started = performance.now();
  const prepared = await prepareSpec(root, path);
  const report: SpecReport = {
    command: SPEC_COMMAND, advisory: true, status: SPEC_STATUS.incomplete, score: null, minScore, model: MODEL,
    rubricDigest: prepared.rubricDigest,
    source: { path: prepared.path, digest: prepared.digest, configDigest: prepared.configDigest, dimensions: prepared.dimensions },
    structural: { passed: !prepared.findings.length, findings: prepared.findings }, reason: null,
    mode: refresh ? JUDGMENT_MODE.live : JUDGMENT_MODE.replay, requests: 0, elapsedMs: 0, checks: [], blocked: [],
  };
  try {
    if (prepared.findings.length) report.status = SPEC_STATUS.review;
    else {
      await preflight(prepared.root, prepared.checks, refresh, dependencies);
      for (const check of prepared.checks) {
        const result = await runCheck(prepared.root, check, refresh, dependencies);
        report.checks.push(result);
        report.requests += result.requests;
        if (result.status === RESULT_STATUS.incomplete) break;
      }
      const complete = report.checks.filter((check) => check.status === RESULT_STATUS.complete);
      if (complete.length === prepared.checks.length) Object.assign(report, scoreSpec(complete.map(({ id, probabilityYes }) => ({ id, probabilityYes })), minScore));
      else report.reason = "Readiness is incomplete; no passing score was assigned.";
    }
    await assertSpecUnchanged(prepared);
  } catch (error) {
    report.status = SPEC_STATUS.incomplete;
    report.score = null;
    report.reason = safeReason(error);
  }
  report.elapsedMs = performance.now() - started;
  return report;
}

async function preflight(root: string, checks: SpecPreparedCheck[], refresh: boolean, dependencies: Dependencies): Promise<void> {
  if (!refresh) {
    // Admit all cached answers before returning any readiness result.
    for (const check of checks) await readReplay(root, check);
    return;
  }
  if (!dependencies.credential?.trim()) throw new OrlyError("TYPESAFE_API_KEY is missing; nothing was uploaded.");
  for (const check of checks) await dependencies.scan(check.request);
  for (const check of checks) replayDestination(root, check);
}

async function runCheck(root: string, check: SpecPreparedCheck, refresh: boolean, dependencies: Dependencies): Promise<CompleteCheck | IncompleteCheck> {
  const started = performance.now();
  let requests = 0;
  let reply: Reply | undefined;
  try {
    let elapsedMs: number;
    if (refresh) {
      if (!dependencies.credential) throw new OrlyError("Provider credential is unavailable.");
      requests = 1;
      reply = await requestAdvice(check, dependencies.credential, dependencies.fetch);
      elapsedMs = performance.now() - started;
      await writeReplay(root, check, reply, elapsedMs);
    } else ({ reply, elapsedMs } = await readReplay(root, check));
    const answer = reply.answers[REPLY_KEY];
    if (answer?.type !== ANSWER_KIND.noul) throw new OrlyError("Spec readiness requires a yes/no probability.");
    return { id: check.id, status: RESULT_STATUS.complete, identity: check.identity, probabilityYes: answer.noul, reply, requests, elapsedMs, usage: reply.usage };
  } catch (error) {
    return { id: check.id, status: RESULT_STATUS.incomplete, reason: safeReason(error), requests, elapsedMs: performance.now() - started, usage: reply?.usage ?? null };
  }
}

function safeReason(error: unknown): string {
  return error instanceof OrlyError ? error.message : "Spec judgment is unavailable; source text and provider details were not logged.";
}

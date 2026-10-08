import { z } from "zod";

import { OrlyError } from "../../../src/model";
import { KIBIBYTE, MODEL, NEWLINE } from "../../../src/judgments/constants";
import { digest } from "../../../src/judgments/files";
import { replySchema } from "../../../src/judgments/wire";
import { gradeJev, JEV_PREFLIGHT_ERROR, MAX_JEV_REQUESTS, nativeJevAnswer, type JevAttempt, type JevExample } from "./jev";
import { adoptionDecision, scoreQuestion, validateObservations } from "./score";
import { CANDIDATE, MEASUREMENT, OBSERVATION, SPLIT, type ComparisonCase, type IndependentLabel } from "./types";

export const JEV_MODE = { live: "--live", replay: "--replay" } as const;
export const MAX_JEV_REPORT_BYTES = 2 * KIBIBYTE * KIBIBYTE;
const PASS = "pass";
const FAIL = "fail";
const UNAVAILABLE = "unavailable";
const VERSION = "0.13.0";
const attemptSchema = z.strictObject({ id: z.string(), question: z.string(), identity: z.string(), request_digest: z.string(),
  requests: z.number().int().min(0).max(1), elapsed_ms: z.number().int().nonnegative(), reply: replySchema.nullable(), failure: z.string().nullable() });
const savedSchema = z.object({ version: z.literal(VERSION), model: z.literal(MODEL), input_digest: z.string(),
  sources: z.array(z.strictObject({ path: z.string().min(1), digest: z.string().regex(/^[a-f0-9]{64}$/) })),
  attempts: z.array(attemptSchema).min(1).max(MAX_JEV_REQUESTS) });

export function inputIdentity(examples: JevExample[]): string {
  return digest(JSON.stringify(examples.map(({ id, identity, expected, input }) => ({ id, identity, expected, request_digest: digest(input.request) }))));
}

export function replayJev(examples: JevExample[], value: unknown, sources: Array<{ path: string; digest: string }>): JevAttempt[] {
  const saved = savedSchema.parse(value);
  if (saved.input_digest !== inputIdentity(examples) || saved.attempts.length !== examples.length ||
    JSON.stringify(saved.sources) !== JSON.stringify(sources)) throw new OrlyError(JEV_PREFLIGHT_ERROR);
  saved.attempts.forEach((attempt, index) => {
    const entry = examples[index];
    if (!entry || (attempt.reply !== null) !== (attempt.failure === null) || (attempt.reply !== null && attempt.requests !== 1)) throw new OrlyError(JEV_PREFLIGHT_ERROR);
    gradeJev(entry, attempt);
  });
  return saved.attempts;
}

export function jevReport(examples: JevExample[], attempts: JevAttempt[], cases: ComparisonCase[], labels: IndependentLabel[],
  sources: Array<{ path: string; digest: string }>, mode: string, completed: boolean) {
  if (attempts.length !== examples.length) throw new OrlyError(JEV_PREFLIGHT_ERROR);
  const results = examples.map((entry, index) => {
    const attempt = attempts[index];
    if (!attempt) throw new OrlyError(JEV_PREFLIGHT_ERROR);
    return gradeJev(entry, attempt);
  });
  const observations = validateObservations(cases, cases.map((entry) => {
    const attempt = attempts.find((item) => item.id === entry.id);
    const answer = attempt?.reply?.answers.decision;
    const native = answer === undefined ? null : nativeJevAnswer(answer);
    return { case_id: entry.id, identity: attempt?.identity, model: MODEL, measurement: mode === JEV_MODE.live ? MEASUREMENT.live : MEASUREMENT.editable,
      status: native === null ? OBSERVATION.unavailable : OBSERVATION.valid,
      answer: native === null ? null : { decision: native.decision, strength: native.strength } };
  }));
  const questions = [...new Set(results.map((entry) => entry.question))].map((question) => {
    const selected = results.filter((entry) => entry.question === question);
    return { question, attempted: selected.length, pass: selected.filter((entry) => entry.status === PASS).length,
      fail: selected.filter((entry) => entry.status === FAIL).length, unavailable: selected.filter((entry) => entry.status === UNAVAILABLE).length,
      uncertain: selected.filter((entry) => entry.uncertain).length };
  });
  const usage = attempts.reduce((total, entry) => ({ input_tokens: total.input_tokens + (entry.reply?.usage.input_tokens ?? 0),
    output_tokens: total.output_tokens + (entry.reply?.usage.output_tokens ?? 0) }), { input_tokens: 0, output_tokens: 0 });
  const scores = Object.values(SPLIT).flatMap((split) => questions.map(({ question }) => ({ split,
    ...scoreQuestion(question, cases.filter((entry) => entry.split === split), labels, observations) })));
  return { version: VERSION, model: MODEL, mode, completed, input_digest: inputIdentity(examples), sources, questions,
    requests: mode === JEV_MODE.live ? attempts.reduce((sum, entry) => sum + entry.requests, 0) : 0, original_requests: attempts.reduce((sum, entry) => sum + entry.requests, 0),
    usage, results, attempts, observations, scores, adoption: Object.values(CANDIDATE).map((question) => adoptionDecision(question, cases, labels, observations, null)),
    limitation: "These are measured Jev answers on fixed examples, not measured autonomous agent improvement. Replay is owner-editable and cannot certify independent provenance." };
}

export function renderJevReport(report: ReturnType<typeof jevReport>): string {
  const rows = report.questions.map((entry) => `| \`${entry.question}\` | ${entry.pass} ✅ | ${entry.fail} ❌ | ${entry.unavailable} | ${entry.uncertain} |`);
  const details = report.results.map((entry) =>
    `| \`${entry.id}\` | \`${entry.question}\` | ${entry.expected} | ${entry.actual ?? UNAVAILABLE} | ${entry.graded ?? UNAVAILABLE} | ${entry.status === PASS ? "✅" : entry.status === FAIL ? "❌" : "⚪"} | ${entry.strength ?? UNAVAILABLE}${entry.uncertain ? " (uncertain)" : ""} |`);
  return ["# orly 0.13.0 — TypeSafe Jev evaluation", "", `Model: \`${report.model}\`. Mode: \`${report.mode}\`. Collection complete: ${report.completed}.`, "",
    "✅ means Jev agrees with the independently grounded expected answer. ❌ means disagreement. ⚪ means no usable answer.",
    "Strength below the frozen 0.8 threshold is graded as abstention; the original native answer remains visible.",
    "These marks grade the examiner's answer; they do not approve the agent's work.", "", "| Judgment | Agrees | Disagrees | Unavailable | Uncertain |", "|---|---:|---:|---:|---:|", ...rows, "",
    "## Every evaluated example", "", "| Example | Judgment | Expected | Jev | Graded decision | Grade | Strength |", "|---|---|---|---|---|---|---:|", ...details, "",
    "## Adoption", "", ...report.adoption.map((entry) => `- \`${entry.question}\`: evaluation-only; ${entry.reasons.join(" ")}`), "",
    `Requests in this run: ${report.requests}. Recorded original requests: ${report.original_requests}. Recorded token usage: ${report.usage.input_tokens} input, ${report.usage.output_tokens} output.`,
    "Raw typed replies, failures, elapsed milliseconds, request digests and source digests are retained in report.json.", "", report.limitation, ""].join(NEWLINE);
}

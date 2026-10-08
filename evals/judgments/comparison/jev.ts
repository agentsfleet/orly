import { z } from "zod";

import { OrlyError } from "../../../src/model";
import { ADVICE_THRESHOLD, ANSWER_KIND, MAX_EVIDENCE, MAX_REQUEST_BYTES, MAX_REQUIREMENT_LENGTH, MAX_STATE_BYTES, MODEL, QUESTIONS, REPLY_KEY } from "../../../src/judgments/constants";
import { byteLength, digest } from "../../../src/judgments/files";
import { CATALOG } from "../../../src/judgments/questions";
import { scanUpload } from "../../../src/judgments/scan";
import { requestAdvice, type Fetch } from "../../../src/judgments/transport";
import type { ProviderInput, ProviderQuestion, QuestionId } from "../../../src/judgments/types";
import { parseReply, type Answer, type Reply } from "../../../src/judgments/wire";
import { caseIdentity } from "./score";
import { CANDIDATE, NATIVE, type ComparisonCase, type ComparisonCatalog, type IndependentLabel, type NativeAnswer } from "./types";

export const MAX_JEV_REQUESTS = 256;
export const JEV_PREFLIGHT_ERROR = "Jev input schedule or upload preflight failed; nothing was uploaded.";
export const JEV_UNAVAILABLE = "Jev request unavailable; raw provider details and credentials were not logged.";
const STARTED = "Jev request started; no usable response has been retained yet.";
const NOUL_MIDPOINT = 0.5;
const stateSchema = z.strictObject({ requirement: z.string().min(1).max(MAX_REQUIREMENT_LENGTH),
  evidence: z.array(z.strictObject({ role: z.string().min(1), text: z.string().min(1) })).min(1).max(MAX_EVIDENCE) });
const requestSchema = z.strictObject({ state: stateSchema, model: z.literal(MODEL), questions: z.strictObject({ [REPLY_KEY]: z.unknown() }) });
type ComparisonQuestion = ComparisonCase["question"];
export type JevExample = { id: string; question: ComparisonQuestion; identity: string; expected: NativeAnswer; input: ProviderInput };
export type JevAttempt = { id: string; question: string; identity: string; request_digest: string; requests: number;
  elapsed_ms: number; reply: Reply | null; failure: string | null };
export type JevDependencies = { fetch: Fetch; scan: typeof scanUpload };

export function providerQuestion(catalog: ComparisonCatalog, question: ComparisonQuestion): ProviderQuestion {
  if (Object.hasOwn(CATALOG, question)) return CATALOG[question as QuestionId].question;
  const candidate = catalog.candidates.find((entry) => entry.question === question);
  if (!candidate) throw new OrlyError(JEV_PREFLIGHT_ERROR);
  return { type: ANSWER_KIND.choice, instructions: candidate.instructions, criteria: candidate.criteria };
}

export function jevInput(question: ProviderQuestion, state: unknown): ProviderInput {
  stateSchema.parse(state);
  if (byteLength(JSON.stringify(state)) > MAX_STATE_BYTES) throw new OrlyError(JEV_PREFLIGHT_ERROR);
  const request = JSON.stringify({ state, model: MODEL, questions: { [REPLY_KEY]: question } });
  if (byteLength(request) > MAX_REQUEST_BYTES) throw new OrlyError(JEV_PREFLIGHT_ERROR);
  return { request, definition: { question } };
}

export function corpusJevExamples(catalog: ComparisonCatalog, cases: ComparisonCase[], labels: IndependentLabel[]): JevExample[] {
  return cases.map((entry) => {
    const label = labels.find((candidate) => candidate.case_id === entry.id);
    if (!label) throw new OrlyError(JEV_PREFLIGHT_ERROR);
    const state = { requirement: entry.requirement, evidence: entry.evidence.map(({ role, content }) => ({ role, text: content })) };
    return { id: entry.id, question: entry.question, identity: caseIdentity(entry), expected: label.expected_native,
      input: jevInput(providerQuestion(catalog, entry.question), state) };
  });
}

export async function evaluateJev(examples: JevExample[], credential: string | undefined,
  dependencies: JevDependencies = { fetch, scan: scanUpload }, retain: (attempt: JevAttempt) => Promise<void> = async () => {}): Promise<JevAttempt[]> {
  validateSchedule(examples);
  let preflight: string | undefined;
  try {
    if (!credential?.trim()) throw new OrlyError("TYPESAFE_API_KEY is missing; nothing was uploaded.");
    for (const entry of examples) await dependencies.scan(entry.input.request);
  } catch (error) { preflight = safeFailure(error); }
  const attempts: JevAttempt[] = [];
  for (const entry of examples) {
    if (preflight === undefined) await retain({ ...missingAttempt(entry, STARTED), requests: 1 });
    const attempt = preflight === undefined ? await evaluateOne(entry, credential ?? "", dependencies.fetch) : missingAttempt(entry, preflight);
    attempts.push(attempt);
    await retain(attempt);
  }
  return attempts;
}

function validateSchedule(examples: JevExample[]): void {
  try {
    if (!examples.length || examples.length > MAX_JEV_REQUESTS || new Set(examples.map((entry) => entry.id)).size !== examples.length) throw new Error();
    for (const entry of examples) {
      if (![...QUESTIONS, ...Object.values(CANDIDATE)].includes(entry.question) || byteLength(entry.input.request) > MAX_REQUEST_BYTES) throw new Error();
      const request = requestSchema.parse(JSON.parse(entry.input.request));
      if (byteLength(JSON.stringify(request.state)) > MAX_STATE_BYTES ||
        JSON.stringify(request.questions[REPLY_KEY]) !== JSON.stringify(entry.input.definition.question)) throw new Error();
    }
  } catch { throw new OrlyError(JEV_PREFLIGHT_ERROR); }
}

async function evaluateOne(entry: JevExample, credential: string, fetcher: Fetch): Promise<JevAttempt> {
  const attempt = missingAttempt(entry, JEV_UNAVAILABLE);
  const started = performance.now();
  attempt.requests = 1;
  try { attempt.reply = await requestAdvice(entry.input, credential, fetcher); attempt.failure = null; }
  catch (error) { attempt.failure = safeFailure(error); }
  attempt.elapsed_ms = Math.ceil(performance.now() - started);
  return attempt;
}

function missingAttempt(entry: JevExample, failure: string): JevAttempt {
  return { id: entry.id, question: entry.question, identity: entry.identity, request_digest: digest(entry.input.request),
    requests: 0, elapsed_ms: 0, reply: null, failure };
}

function safeFailure(error: unknown): string { return error instanceof OrlyError ? error.message : JEV_UNAVAILABLE; }

export function nativeJevAnswer(answer: Answer): { decision: string; strength: number; uncertain: boolean } {
  const strength = answer.type === ANSWER_KIND.noul ? Math.max(answer.noul, 1 - answer.noul) : answer.confidence;
  const raw = answer.type === ANSWER_KIND.noul ? answer.noul >= NOUL_MIDPOINT ? NATIVE.yes : NATIVE.no : answer.choice;
  return { decision: raw, strength, uncertain: strength < ADVICE_THRESHOLD };
}

export function gradeJev(example: JevExample, attempt: JevAttempt) {
  if (attempt.id !== example.id || attempt.identity !== example.identity || attempt.question !== example.question ||
    attempt.request_digest !== digest(example.input.request) || (attempt.reply !== null) !== (attempt.failure === null) ||
    (attempt.reply !== null && attempt.requests !== 1)) throw new OrlyError(JEV_PREFLIGHT_ERROR);
  const reply = attempt.reply === null ? null : parseReply(attempt.reply, example.input);
  const answer = reply?.answers[REPLY_KEY];
  const native = answer === undefined ? null : nativeJevAnswer(answer);
  const graded = native?.uncertain ? NATIVE.abstain : native?.decision ?? null;
  return { id: example.id, question: example.question, expected: example.expected, actual: native?.decision ?? null, graded,
    uncertain: native?.uncertain ?? null, strength: native?.strength ?? null,
    status: native === null ? "unavailable" : graded === example.expected ? "pass" : "fail" };
}
